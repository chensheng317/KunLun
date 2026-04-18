"""
执行日志生成器

任务完成后将每步 thinking + action 汇总为 Markdown 格式的执行日志，
保存到 backend/outputs/ 目录。

NOTE: 日志为纯文字格式，不包含截图，确保轻量可存储。
额外生成 .txt 数据汇总报告，从 Agent 最终 summary 中提取关键数据。
"""

import logging
import os
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# 日志输出目录
OUTPUTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "outputs",
)

# 确保输出目录存在
os.makedirs(OUTPUTS_DIR, exist_ok=True)


class LogWriter:
    """
    执行日志写入器

    在任务执行过程中逐步累积 thinking/action 记录，
    任务结束时调用 finalize() 一次性写入 .md 日志 + .txt 数据汇总。
    """

    def __init__(
        self,
        task_id: str,
        device_id: str,
        device_model: str,
        command: str,
    ) -> None:
        self._task_id = task_id
        self._device_id = device_id
        self._device_model = device_model
        self._command = command
        self._start_time = datetime.now()
        self._steps: list[dict] = []

    def add_step(
        self,
        step: int,
        thinking: str,
        action_type: str,
        action_description: str,
    ) -> None:
        """记录一步执行数据"""
        self._steps.append({
            "step": step,
            "thinking": thinking,
            "action_type": action_type,
            "action_description": action_description,
        })

    def finalize(
        self,
        summary: str,
        total_steps: int,
        success: bool = True,
    ) -> tuple[str, list[str]]:
        """
        生成 MD 日志文件 + TXT 数据汇总报告并写入磁盘

        Returns:
            (日志文件路径, 额外产物文件路径列表)
        """
        end_time = datetime.now()
        status = "成功 ✅" if success else "失败 ❌"

        # ---- 1. 生成 .md 执行日志 ----
        lines = [
            "# 数字员工执行日志\n",
            f"- **任务ID**: {self._task_id}",
            f"- **设备**: {self._device_model} ({self._device_id})",
            f"- **指令**: {self._command}",
            f"- **开始时间**: {self._start_time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"- **结束时间**: {end_time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"- **总步数**: {total_steps}",
            f"- **状态**: {status}",
            "",
            "---",
            "",
            "## 执行过程",
            "",
        ]

        for step_data in self._steps:
            step_num = step_data["step"]
            thinking = step_data["thinking"]
            action_type = step_data["action_type"]
            action_desc = step_data["action_description"]

            lines.append(f"### Step {step_num}")
            if thinking:
                # 截断过长的 thinking，日志中保留前 500 字符
                display_thinking = (
                    thinking[:500] + "..." if len(thinking) > 500 else thinking
                )
                lines.append(f"- **思考**: {display_thinking}")
            if action_type:
                lines.append(f"- **动作**: [{action_type}] {action_desc}")
            lines.append("")

        lines.extend([
            "---",
            "",
            "## 执行结果摘要",
            "",
            summary,
            "",
        ])

        # 写入 .md 文件
        md_filename = f"{self._task_id}.md"
        md_filepath = os.path.join(OUTPUTS_DIR, md_filename)

        try:
            with open(md_filepath, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            logger.info("Log written | path=%s", md_filepath)
        except Exception as exc:
            logger.error("Failed to write log: %s", exc)

        # ---- 2. 生成 .txt 数据汇总报告 ----
        # NOTE: 从 Agent 的 summary（finish message）和各步 thinking 中提取数据
        extra_files: list[str] = []

        if success:
            txt_path = self._generate_summary_report(summary, end_time)
            if txt_path:
                extra_files.append(txt_path)

        return f"outputs/{md_filename}", extra_files

    def _generate_summary_report(
        self,
        summary: str,
        end_time: datetime,
    ) -> Optional[str]:
        """
        从 Agent 的 finish message 和 thinking 记录中提取数据，
        生成纯文本的数据汇总报告

        NOTE: 报告内容 = Agent finish message + 各步 thinking 中的关键数据
        """
        report_lines = [
            "=" * 60,
            "  昆仑工坊 · 数字员工 — 任务数据汇总报告",
            "=" * 60,
            "",
            f"任务ID: {self._task_id}",
            f"设备:   {self._device_model} ({self._device_id})",
            f"指令:   {self._command[:100]}",
            f"时间:   {self._start_time.strftime('%Y-%m-%d %H:%M:%S')} → {end_time.strftime('%H:%M:%S')}",
            f"总步数: {len(self._steps)}",
            "",
            "-" * 60,
            "  Agent 输出汇总",
            "-" * 60,
            "",
            summary,
            "",
            "-" * 60,
            "  各步骤采集的详细数据",
            "-" * 60,
            "",
        ]

        # 提取每步 thinking 中的数据（过滤掉无实际内容的步骤）
        for step_data in self._steps:
            thinking = step_data.get("thinking", "")
            if not thinking or len(thinking) < 20:
                continue
            step_num = step_data["step"]
            report_lines.append(f"[Step {step_num}]")
            report_lines.append(thinking)
            report_lines.append("")

        report_lines.extend([
            "=" * 60,
            "  报告生成完毕",
            "=" * 60,
        ])

        # 写入 .txt 文件
        txt_filename = f"{self._task_id}_report.txt"
        txt_filepath = os.path.join(OUTPUTS_DIR, txt_filename)

        try:
            with open(txt_filepath, "w", encoding="utf-8") as f:
                f.write("\n".join(report_lines))
            logger.info("Summary report written | path=%s", txt_filepath)
            return f"outputs/{txt_filename}"
        except Exception as exc:
            logger.error("Failed to write summary report: %s", exc)
            return None
