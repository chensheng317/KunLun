"""
数字员工 WebSocket 路由与 REST API 端点

核心端点：
- ws://host/ws/digital-worker — WebSocket 双向通信（指令下发 + 实时进度推送）
- GET /api/digital-worker/devices — 备用 REST 接口获取设备列表
"""

import asyncio
import json
import logging
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from digital_worker.device_manager import get_connected_devices
from digital_worker.log_writer import OUTPUTS_DIR
from digital_worker.schemas import (
    ClientMessageType,
    CancelTaskPayload,
    DeviceListPayload,
    ServerMessageType,
    StartTaskPayload,
    TakeoverDonePayload,
)
from digital_worker.task_manager import task_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["digital-worker"])


# ================================================================
#  WebSocket 端点
# ================================================================

@router.websocket("/ws/digital-worker")
async def digitalWorkerWebsocket(websocket: WebSocket) -> None:
    """
    数字员工 WebSocket 双向通信端点

    连接建立后：
    1. 注入 WebSocket 发送函数到 TaskManager
    2. 持续监听前端消息并路由到对应处理器
    3. 连接断开时清理资源
    """
    await websocket.accept()
    logger.info("WebSocket connected")

    # 获取当前事件循环，用于 Agent 线程 → 异步桥接
    loop = asyncio.get_event_loop()

    async def wsSend(message: dict) -> None:
        """统一的 WebSocket 发送函数"""
        await websocket.send_json(message)

    # 注入发送函数到全局 TaskManager
    task_manager.set_ws_sender(wsSend, loop)

    try:
        while True:
            # 等待前端消息
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON received: %s", raw[:200])
                continue

            msg_type = data.get("type", "")
            payload = data.get("payload", {})

            await _handleClientMessage(msg_type, payload)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as exc:
        logger.error("WebSocket error: %s", exc, exc_info=True)
    finally:
        task_manager.clear_ws_sender()


async def _handleClientMessage(msg_type: str, payload: dict) -> None:
    """根据消息类型路由到对应处理器"""

    if msg_type == ClientMessageType.START_TASK:
        parsed = StartTaskPayload(**payload)
        await task_manager.create_task(
            command=parsed.command,
            device_id=parsed.device_id,
            max_steps=parsed.max_steps,
            skill_id=parsed.skill_id,
        )

    elif msg_type == ClientMessageType.CANCEL_TASK:
        parsed = CancelTaskPayload(**payload)
        await task_manager.cancel_task(parsed.task_id)

    elif msg_type == ClientMessageType.TAKEOVER_DONE:
        parsed = TakeoverDonePayload(**payload)
        await task_manager.handle_takeover_done(parsed.task_id)

    elif msg_type == ClientMessageType.LIST_DEVICES:
        devices = get_connected_devices()
        await task_manager._send_message(
            ServerMessageType.DEVICE_LIST,
            DeviceListPayload(devices=devices).model_dump(),
        )

    else:
        logger.warning("Unknown client message type: %s", msg_type)


# ================================================================
#  REST API 备用接口
# ================================================================

@router.get("/api/digital-worker/devices")
async def listDevices():
    """
    获取已连接设备列表

    作为 WebSocket list_devices 的备用 REST 接口，
    便于前端在 WebSocket 连接建立前获取设备列表。
    """
    devices = get_connected_devices()
    return {
        "devices": [d.model_dump() for d in devices],
    }


@router.get("/api/digital-worker/logs/{filename}")
async def downloadLog(filename: str):
    """
    下载数字员工执行产物

    支持下载 outputs 目录下的 .md（执行日志）和 .txt（信息汇总）文件。
    NOTE: 仅允许指定后缀，防止路径穿越
    """
    # 安全校验：过滤路径穿越
    if ".." in filename or "/" in filename or "\\" in filename:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid filename")

    # 白名单后缀：.md（执行日志）+ .txt（信息汇总产物）
    ALLOWED_EXTENSIONS = {".md", ".txt"}
    _, ext = os.path.splitext(filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Only {', '.join(ALLOWED_EXTENSIONS)} files allowed",
        )

    filepath = os.path.join(OUTPUTS_DIR, filename)
    if not os.path.isfile(filepath):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")

    # 根据后缀设置正确的 MIME 类型
    media_types = {
        ".md": "text/markdown",
        ".txt": "text/plain",
    }

    return FileResponse(
        path=filepath,
        filename=filename,
        media_type=media_types.get(ext.lower(), "application/octet-stream"),
    )
