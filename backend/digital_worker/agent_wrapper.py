"""
PhoneAgent 适配层

将 Open-AutoGLM 的同步阻塞式 PhoneAgent 封装为支持回调钩子的包装器，
在独立线程中运行 Agent 循环，每步通过回调推送 thinking/action 给 WebSocket。

NOTE: 核心改造点是将 PhoneAgent._execute_step 的 print() 输出
      替换为结构化回调，避免在 FastAPI 事件循环中阻塞。
"""

import json
import logging
import os
import sys
import threading
import traceback
from dataclasses import dataclass
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# 将 Open-AutoGLM 的源码目录加入 sys.path 以便导入
_AUTOGLM_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "Open-AutoGLM-main",
)
if _AUTOGLM_ROOT not in sys.path:
    sys.path.insert(0, _AUTOGLM_ROOT)

from phone_agent.agent import AgentConfig, PhoneAgent, StepResult
from phone_agent.actions.handler import parse_action, finish
from phone_agent.config import get_system_prompt
from phone_agent.device_factory import get_device_factory
from phone_agent.model import ModelClient, ModelConfig
from phone_agent.model.client import MessageBuilder


# ================================================================
#  动作类型的中文描述映射
# ================================================================

ACTION_TYPE_DESCRIPTIONS: dict[str, str] = {
    "Launch": "启动应用",
    "Tap": "点击",
    "Type": "输入文字",
    "Type_Name": "输入文字",
    "Swipe": "滑动",
    "Back": "返回",
    "Home": "回到桌面",
    "Double Tap": "双击",
    "Long Press": "长按",
    "Wait": "等待",
    "Take_over": "人工接管",
    "Note": "记录内容",
    "Call_API": "调用 API",
    "Interact": "交互请求",
}


@dataclass
class StepCallbackData:
    """每步回调传递的数据"""
    step: int
    thinking: str
    action_type: str
    action_description: str
    raw_action: dict[str, Any]
    finished: bool
    message: Optional[str] = None


class PhoneAgentWrapper:
    """
    Open-AutoGLM PhoneAgent 的 Web 适配包装器

    核心职责：
    1. 在独立线程中运行 Agent 感知-推理-执行循环
    2. 拦截每步的 thinking/action 通过回调推送给 WebSocket
    3. 处理 Take_over 事件：暂停循环 → 等待前端确认 → 恢复
    4. 支持外部安全取消正在运行的任务
    """

    def __init__(
        self,
        device_id: str,
        on_step: Callable[[StepCallbackData], None],
        on_takeover: Callable[[str], None],
        on_complete: Callable[[str, int], None],
        on_error: Callable[[str, str], None],
    ):
        """
        Args:
            device_id: ADB 设备 ID
            on_step: 每步回调 — 推送 thinking + action 给前端
            on_takeover: 人工接管回调 — 通知前端弹窗
            on_complete: 任务完成回调 — 参数 (summary, total_steps)
            on_error: 任务失败回调 — 参数 (error_code, error_message)
        """
        self._device_id = device_id
        self._on_step = on_step
        self._on_takeover = on_takeover
        self._on_complete = on_complete
        self._on_error = on_error

        # 任务取消标记
        self._cancelled = threading.Event()
        # 人工接管等待信号
        self._takeover_event = threading.Event()
        # 执行线程引用
        self._thread: Optional[threading.Thread] = None
        # 步数计数
        self._step_count = 0

    @property
    def step_count(self) -> int:
        return self._step_count

    def start(self, command: str, max_steps: int = 100) -> None:
        """
        在独立线程中启动任务执行

        Args:
            command: 自然语言指令
            max_steps: 最大执行步数
        """
        self._thread = threading.Thread(
            target=self._run_agent_loop,
            args=(command, max_steps),
            daemon=True,
            name=f"agent-{self._device_id}",
        )
        self._thread.start()

    def cancel(self) -> None:
        """安全取消正在执行的任务"""
        self._cancelled.set()
        # 如果正在等待人工接管，也解除阻塞
        self._takeover_event.set()

    def resume_from_takeover(self) -> None:
        """用户完成手机操作后，恢复 Agent 执行"""
        self._takeover_event.set()

    def _run_agent_loop(self, command: str, max_steps: int) -> None:
        """
        Agent 核心循环（在独立线程中执行）

        NOTE: 不直接使用 PhoneAgent.run()，而是手动调用 step()，
              以便在每步之间插入回调推送和取消检查。
        """
        try:
            # 从环境变量读取模型配置
            base_url = os.getenv(
                "AUTOGLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"
            )
            model_name = os.getenv("AUTOGLM_MODEL", "autoglm-phone")
            api_key = os.getenv("AUTOGLM_API_KEY", "EMPTY")

            model_config = ModelConfig(
                base_url=base_url,
                model_name=model_name,
                api_key=api_key,
                lang="cn",
            )

            # NOTE: system_prompt 不传（None），AutoGLM 使用默认的手机操控 prompt。
            #       技能增强内容已在 TaskManager 层拼接到 command 中。
            agent_config = AgentConfig(
                max_steps=max_steps,
                device_id=self._device_id,
                verbose=False,  # 禁用 stdout 打印，改用回调
                lang="cn",
            )

            # 自定义 takeover 回调：阻塞线程直到前端确认
            def takeover_handler(message: str) -> None:
                self._takeover_event.clear()
                self._on_takeover(message)
                # 阻塞等待前端发送 takeover_done 或任务被取消
                self._takeover_event.wait()

            agent = PhoneAgent(
                model_config=model_config,
                agent_config=agent_config,
                takeover_callback=takeover_handler,
            )

            logger.info(
                "Agent loop started | device=%s | command=%s",
                self._device_id,
                command[:80],
            )

            # 第一步：带用户指令
            self._step_count = 0
            result = self._execute_and_report_step(agent, command, is_first=True)

            if result.finished or self._cancelled.is_set():
                self._finalize(result)
                return

            # 后续步骤
            while self._step_count < max_steps:
                if self._cancelled.is_set():
                    self._on_error("ERR_TASK_CANCELLED", "任务已被用户取消")
                    return

                result = self._execute_and_report_step(agent, is_first=False)

                if result.finished or self._cancelled.is_set():
                    break

            self._finalize(result)

        except Exception as exc:
            logger.error("Agent loop error: %s", exc, exc_info=True)
            self._on_error("ERR_AGENT_INTERNAL", str(exc))

    def _execute_and_report_step(
        self,
        agent: PhoneAgent,
        user_prompt: Optional[str] = None,
        is_first: bool = False,
    ) -> StepResult:
        """
        执行单步并通过回调推送结果

        NOTE: 直接调用 agent._execute_step() 而非 agent.step()，
              以获取完整的 StepResult 结构（包含 thinking 和 parsed action）。
        """
        self._step_count += 1

        try:
            result = agent._execute_step(
                user_prompt=user_prompt, is_first=is_first
            )
        except Exception as exc:
            logger.error("Step %d error: %s", self._step_count, exc)

            # NOTE: 识别 ADB 设备连接类异常，给出更友好的排查提示
            # 常见场景：USB 物理连接松动 / 设备断开 / dumpsys 命令超时
            exc_str = str(exc).lower()
            is_connection_issue = any(
                keyword in exc_str
                for keyword in [
                    "dumpsys", "no output", "adb", "device not found",
                    "error: closed", "timeout", "connection refused",
                ]
            )

            if is_connection_issue:
                error_code = "ERR_DEVICE_CONNECTION"
                error_message = (
                    f"第 {self._step_count} 步执行失败：无法与设备通信。\n"
                    "可能原因：\n"
                    "• USB 数据线物理连接松动或断开\n"
                    "• 设备屏幕锁定或休眠\n"
                    "• ADB 连接被系统中断\n"
                    "请检查 USB 连接并确保设备屏幕亮起后重试。"
                )
            else:
                error_code = "ERR_STEP_FAILED"
                error_message = f"Step {self._step_count} failed: {exc}"

            self._on_error(error_code, error_message)
            return StepResult(
                success=False, finished=True, action=None,
                thinking="", message=str(exc),
            )

        # 构造动作描述（不包含坐标，只保留类型和语义描述）
        action_type = ""
        action_desc = ""
        if result.action:
            action_type = result.action.get("action", result.action.get("_metadata", ""))
            action_desc = self._build_action_description(result.action)

        callback_data = StepCallbackData(
            step=self._step_count,
            thinking=result.thinking,
            action_type=action_type,
            action_description=action_desc,
            raw_action=result.action or {},
            finished=result.finished,
            message=result.message,
        )

        self._on_step(callback_data)
        return result

    def _build_action_description(self, action: dict[str, Any]) -> str:
        """
        从 action dict 构建面向用户的自然语言描述

        NOTE: 不暴露坐标数值，只提供操作类型 + 语义上下文
        """
        action_name = action.get("action", "")
        metadata = action.get("_metadata", "")

        if metadata == "finish":
            return f"任务完成: {action.get('message', '')}"

        base_desc = ACTION_TYPE_DESCRIPTIONS.get(action_name, action_name)

        # 为特定动作补充上下文
        if action_name == "Launch":
            app = action.get("app", "")
            return f"{base_desc} {app}"
        elif action_name == "Type" or action_name == "Type_Name":
            text = action.get("text", "")
            # 截断长文本，避免过量推送
            display_text = text[:50] + "..." if len(text) > 50 else text
            return f'{base_desc}: "{display_text}"'
        elif action_name == "Wait":
            duration = action.get("duration", "")
            return f"{base_desc} {duration}"
        elif action_name == "Take_over":
            return f"{base_desc}: {action.get('message', '需要人工操作')}"

        return base_desc

    def _finalize(self, result: StepResult) -> None:
        """任务结束后的收尾处理"""
        if self._cancelled.is_set():
            self._on_error("ERR_TASK_CANCELLED", "任务已被用户取消")
        else:
            summary = result.message or "任务已完成"
            self._on_complete(summary, self._step_count)
