"""
异步任务管理器

管理所有活跃的数字员工任务生命周期：创建 → 执行 → 完成/取消。
每个任务持有独立的 PhoneAgentWrapper 实例，确保多设备并行执行互不干扰。
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from digital_worker.agent_wrapper import PhoneAgentWrapper, StepCallbackData
from digital_worker.device_manager import (
    get_connected_devices,
    is_device_available,
    mark_device_busy,
    mark_device_free,
)
from digital_worker.log_writer import LogWriter
from digital_worker.schemas import (
    ActionPayload,
    ServerMessageType,
    TaskCancelledPayload,
    TaskCompletedPayload,
    TaskCreatedPayload,
    TaskFailedPayload,
    TakeoverRequestPayload,
    ThinkingPayload,
)

logger = logging.getLogger(__name__)


@dataclass
class TaskContext:
    """单个任务的运行时上下文"""
    task_id: str
    device_id: str
    device_model: str
    command: str
    agent: PhoneAgentWrapper
    log_writer: LogWriter
    created_at: float = field(default_factory=time.time)


class TaskManager:
    """
    数字员工任务管理器（单例模式）

    职责：
    - 维护活跃任务字典 active_tasks
    - 创建任务时启动独立 Agent 线程
    - 通过 asyncio 事件循环将 Agent 线程的同步回调桥接到 WebSocket 异步推送
    """

    def __init__(self) -> None:
        self._active_tasks: dict[str, TaskContext] = {}
        # WebSocket 发送回调，由 router.py 在连接建立时注入
        self._ws_send: Optional[Any] = None
        # 事件循环引用，用于线程→异步桥接
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_ws_sender(
        self,
        send_fn: Any,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        """注入 WebSocket 发送函数和事件循环"""
        self._ws_send = send_fn
        self._loop = loop

    def clear_ws_sender(self) -> None:
        """清除 WebSocket 发送函数（连接断开时调用）"""
        self._ws_send = None
        self._loop = None

    # ================================================================
    #  任务操作
    # ================================================================

    async def create_task(
        self,
        command: str,
        device_id: str,
        max_steps: int = 100,
        skill_id: str | None = None,
    ) -> Optional[str]:
        """
        创建并启动一个新任务

        Args:
            skill_id: 内置指令 ID。不为空时从 SKILL_PROMPTS 加载专属 system prompt，
                      并使用 SKILL_MAX_STEPS 覆盖默认步数。

        Returns:
            task_id 或 None（如果设备不可用）
        """
        # 检查设备是否可用
        if not is_device_available(device_id):
            await self._send_message(
                ServerMessageType.TASK_FAILED,
                TaskFailedPayload(
                    task_id="",
                    error_code="ERR_DEVICE_OFFLINE",
                    error_message=f"设备 {device_id} 未连接或不可用",
                ).model_dump(),
            )
            return None

        # 检查设备是否正在执行其他任务
        for ctx in self._active_tasks.values():
            if ctx.device_id == device_id:
                await self._send_message(
                    ServerMessageType.TASK_FAILED,
                    TaskFailedPayload(
                        task_id="",
                        error_code="ERR_DEVICE_BUSY",
                        error_message=f"设备 {device_id} 正在执行其他任务",
                    ).model_dump(),
                )
                return None

        # NOTE: 如果指定了内置指令，将领域增强 prompt 拼接到用户指令前面
        # FIXME: 之前的方案是替换 system_prompt，导致 AutoGLM 丢失手机操控身份认知，
        #        模型在第一步就返回 finish 并输出虚构报告。
        #        正确做法：保留 AutoGLM 默认 system prompt（手机操控者身份），
        #        将增强内容作为任务上下文拼接到 user command 前面。
        if skill_id:
            from digital_worker.skill_prompts import SKILL_PROMPTS, SKILL_MAX_STEPS
            skill_prompt = SKILL_PROMPTS.get(skill_id)
            if skill_prompt is None:
                logger.warning("Unknown skill_id: %s, no prompt injected", skill_id)
            else:
                # 将增强 prompt 拼接到用户指令前面
                command = f"{skill_prompt.strip()}\n\n---\n\n【用户实际指令】{command}"
                # 使用该口令的建议最大步数（除非用户显式指定了更大的值）
                recommended = SKILL_MAX_STEPS.get(skill_id, 100)
                max_steps = max(max_steps, recommended)
                logger.info(
                    "Skill prompt injected to command | skill_id=%s | max_steps=%d",
                    skill_id, max_steps,
                )

        # 生成任务 ID
        task_id = f"task_{int(time.time())}_{device_id[:8]}"

        # 获取设备型号
        from digital_worker.device_manager import get_device_info
        device = get_device_info(device_id)
        device_model = device.model if device else "Unknown"

        # 创建日志写入器
        log_writer = LogWriter(task_id, device_id, device_model, command)

        # 创建 Agent 包装器（回调函数是同步的，在 Agent 线程中执行）
        # NOTE: 不再传递 system_prompt，让 AutoGLM 使用默认的手机操控 system prompt
        agent = PhoneAgentWrapper(
            device_id=device_id,
            on_step=lambda data: self._on_step_sync(task_id, data),
            on_takeover=lambda reason: self._on_takeover_sync(task_id, reason),
            on_complete=lambda summary, steps: self._on_complete_sync(
                task_id, summary, steps
            ),
            on_error=lambda code, msg: self._on_error_sync(task_id, code, msg),
        )

        # 注册任务
        ctx = TaskContext(
            task_id=task_id,
            device_id=device_id,
            device_model=device_model,
            command=command,
            agent=agent,
            log_writer=log_writer,
        )
        self._active_tasks[task_id] = ctx
        mark_device_busy(device_id)

        # 推送 task_created
        await self._send_message(
            ServerMessageType.TASK_CREATED,
            TaskCreatedPayload(
                task_id=task_id,
                device_id=device_id,
                device_model=device_model,
            ).model_dump(),
        )

        # 启动 Agent 线程
        agent.start(command, max_steps)

        logger.info(
            "Task created | id=%s | device=%s | skill=%s | command=%s",
            task_id,
            device_id,
            skill_id or "custom",
            command[:80],
        )
        return task_id

    async def cancel_task(self, task_id: str) -> None:
        """取消正在执行的任务"""
        ctx = self._active_tasks.get(task_id)
        if ctx is None:
            logger.warning("Cancel requested for unknown task: %s", task_id)
            return

        ctx.agent.cancel()
        logger.info("Task cancel requested | id=%s", task_id)

    async def handle_takeover_done(self, task_id: str) -> None:
        """用户完成手机操作后恢复 Agent 执行"""
        ctx = self._active_tasks.get(task_id)
        if ctx is None:
            logger.warning("Takeover done for unknown task: %s", task_id)
            return

        ctx.agent.resume_from_takeover()
        logger.info("Takeover resumed | id=%s", task_id)

    # ================================================================
    #  Agent 线程 → WebSocket 异步桥接回调
    # ================================================================

    def _on_step_sync(self, task_id: str, data: StepCallbackData) -> None:
        """Agent 线程中的每步回调（同步 → 异步桥接）"""
        ctx = self._active_tasks.get(task_id)
        if ctx is None:
            return

        # 记录到日志
        ctx.log_writer.add_step(
            step=data.step,
            thinking=data.thinking,
            action_type=data.action_type,
            action_description=data.action_description,
        )

        # 推送 thinking
        if data.thinking:
            self._schedule_send(
                ServerMessageType.THINKING,
                ThinkingPayload(
                    task_id=task_id,
                    step=data.step,
                    content=data.thinking,
                ).model_dump(),
            )

        # 推送 action
        if data.action_type and data.action_type != "finish":
            self._schedule_send(
                ServerMessageType.ACTION,
                ActionPayload(
                    task_id=task_id,
                    step=data.step,
                    action_type=data.action_type,
                    description=data.action_description,
                ).model_dump(),
            )

    def _on_takeover_sync(self, task_id: str, reason: str) -> None:
        """Agent 线程中的人工接管回调"""
        self._schedule_send(
            ServerMessageType.TAKEOVER_REQUEST,
            TakeoverRequestPayload(
                task_id=task_id,
                reason=reason,
            ).model_dump(),
        )

    def _on_complete_sync(self, task_id: str, summary: str, total_steps: int) -> None:
        """Agent 线程中的任务完成回调"""
        ctx = self._active_tasks.get(task_id)
        if ctx is None:
            return

        # 写入日志文件 + 生成数据汇总报告
        log_path, extra_files = ctx.log_writer.finalize(summary, total_steps, success=True)

        # 推送 task_completed（携带额外产物文件如 .txt 报告）
        self._schedule_send(
            ServerMessageType.TASK_COMPLETED,
            TaskCompletedPayload(
                task_id=task_id,
                total_steps=total_steps,
                log_file=log_path,
                summary=summary,
                extra_files=extra_files,
            ).model_dump(),
        )

        # 清理任务
        self._cleanup_task(task_id)

    def _on_error_sync(self, task_id: str, error_code: str, error_message: str) -> None:
        """Agent 线程中的任务失败回调"""
        ctx = self._active_tasks.get(task_id)

        if ctx and error_code == "ERR_TASK_CANCELLED":
            # 取消时也写日志（不生成汇总报告）
            log_path, _ = ctx.log_writer.finalize(
                "任务被用户取消", ctx.agent.step_count, success=False
            )
            self._schedule_send(
                ServerMessageType.TASK_CANCELLED,
                TaskCancelledPayload(
                    task_id=task_id,
                    steps_completed=ctx.agent.step_count,
                ).model_dump(),
            )
        else:
            self._schedule_send(
                ServerMessageType.TASK_FAILED,
                TaskFailedPayload(
                    task_id=task_id,
                    error_code=error_code,
                    error_message=error_message,
                ).model_dump(),
            )

        self._cleanup_task(task_id)

    # ================================================================
    #  内部工具
    # ================================================================

    def _cleanup_task(self, task_id: str) -> None:
        """清理已完成/失败/取消的任务"""
        ctx = self._active_tasks.pop(task_id, None)
        if ctx:
            mark_device_free(ctx.device_id)
            logger.info("Task cleaned up | id=%s", task_id)

    def _schedule_send(self, msg_type: ServerMessageType, payload: dict) -> None:
        """
        将同步回调中的消息推送调度到 asyncio 事件循环

        NOTE: Agent 线程中不能直接 await，需要通过 loop.call_soon_threadsafe
        """
        if self._loop is None or self._ws_send is None:
            return

        message = {"type": msg_type.value, "payload": payload}

        async def _do_send():
            try:
                if self._ws_send:
                    await self._ws_send(message)
            except Exception as exc:
                logger.error("WebSocket send error: %s", exc)

        self._loop.call_soon_threadsafe(
            asyncio.ensure_future, _do_send()
        )

    async def _send_message(self, msg_type: ServerMessageType, payload: dict) -> None:
        """直接在异步上下文中发送 WebSocket 消息"""
        if self._ws_send is None:
            return

        message = {"type": msg_type.value, "payload": payload}
        try:
            await self._ws_send(message)
        except Exception as exc:
            logger.error("WebSocket send error: %s", exc)


# 全局单例
task_manager = TaskManager()
