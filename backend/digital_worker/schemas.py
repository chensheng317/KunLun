"""
数字员工 WebSocket 消息类型定义

NOTE: 所有前后端通信均通过 JSON 消息传递，此模块定义消息结构。
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ================================================================
#  设备信息
# ================================================================

class DeviceStatus(str, Enum):
    """设备状态枚举"""
    ONLINE = "online"
    BUSY = "busy"
    OFFLINE = "offline"


class DeviceInfo(BaseModel):
    """ADB 设备信息"""
    id: str = Field(description="ADB 设备 ID，如 R5CT209ABCD")
    model: str = Field(default="Unknown", description="设备型号，如 Xiaomi 14")
    brand: str = Field(default="Unknown", description="设备品牌，如 Xiaomi")
    status: DeviceStatus = Field(default=DeviceStatus.ONLINE)


# ================================================================
#  前端 → 后端 消息
# ================================================================

class ClientMessageType(str, Enum):
    """前端发送的消息类型"""
    START_TASK = "start_task"
    CANCEL_TASK = "cancel_task"
    TAKEOVER_DONE = "takeover_done"
    LIST_DEVICES = "list_devices"


class StartTaskPayload(BaseModel):
    """启动任务载荷"""
    command: str = Field(description="自然语言指令")
    device_id: str = Field(description="目标设备 ADB ID")
    max_steps: int = Field(default=100, description="最大执行步数")
    # NOTE: 内置指令 ID，无值时使用默认 system prompt（自定义指令模式）
    skill_id: str | None = Field(default=None, description="内置指令 ID，对应 SKILL_PROMPTS key")


class CancelTaskPayload(BaseModel):
    """取消任务载荷"""
    task_id: str


class TakeoverDonePayload(BaseModel):
    """人工接管完成载荷"""
    task_id: str


# ================================================================
#  后端 → 前端 消息
# ================================================================

class ServerMessageType(str, Enum):
    """后端推送的消息类型"""
    TASK_CREATED = "task_created"
    THINKING = "thinking"
    ACTION = "action"
    TAKEOVER_REQUEST = "takeover_request"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CANCELLED = "task_cancelled"
    DEVICE_LIST = "device_list"


class TaskCreatedPayload(BaseModel):
    """任务已创建"""
    task_id: str
    device_id: str
    device_model: str


class ThinkingPayload(BaseModel):
    """思考过程推送"""
    task_id: str
    step: int
    content: str


class ActionPayload(BaseModel):
    """执行动作推送"""
    task_id: str
    step: int
    action_type: str = Field(description="动作类型，如 Tap/Swipe/Launch/Type 等")
    description: str = Field(description="动作的自然语言描述")


class TakeoverRequestPayload(BaseModel):
    """人工接管请求"""
    task_id: str
    reason: str


class TaskCompletedPayload(BaseModel):
    """任务完成"""
    task_id: str
    total_steps: int
    log_file: str
    summary: str
    # NOTE: 附加产物文件路径列表（如信息汇总 .txt），可选
    extra_files: list[str] = Field(default_factory=list)


class TaskFailedPayload(BaseModel):
    """任务失败"""
    task_id: str
    error_code: str
    error_message: str


class TaskCancelledPayload(BaseModel):
    """任务已取消"""
    task_id: str
    steps_completed: int


class DeviceListPayload(BaseModel):
    """设备列表"""
    devices: list[DeviceInfo]


# ================================================================
#  通用消息封装
# ================================================================

class WsMessage(BaseModel):
    """
    WebSocket 消息统一封装

    前后端通信的所有消息均遵循 { type, payload } 结构。
    """
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
