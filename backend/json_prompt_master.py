"""
JSON提示词大师服务 — Coze 智能体对话接口
NOTE: 接入 Coze (扣子) 智能体 API，提供对话式 JSON 提示词生成/优化/反推服务
功能包括：
- 基于 Coze Bot 的流式对话（SSE）
- 会话历史管理（创建/列表/删除）
- 消息历史查询（支持续聊）

技术方案：
- 使用 cozepy 官方 SDK 与 Coze API 通信
- 后端通过 coze.chat.stream() 获取流式数据，转译为 SSE 推送给前端
- 会话索引存储在 PostgreSQL json_prompt_conversations 表
- user_id 从 JWT Token 中解析（Phase 2 迁移完成）
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File as FastAPIFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from cozepy import (
    Coze,
    TokenAuth,
    Message,
    ChatEventType,
    MessageContentType,
    COZE_CN_BASE_URL,
)
from cozepy.chat import MessageObjectString

from database.connection import get_db
from auth.dependencies import getCurrentUser
from models.user import User
from models.conversation import JsonPromptConversation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/json-prompt", tags=["JSON提示词大师"])

# ── Coze API 配置 ──────────────────────────────────────────────
COZE_API_TOKEN = os.getenv("COZE_API_TOKEN", "")
COZE_BOT_ID = os.getenv("COZE_BOT_ID", "")


# ── 数据库 CRUD 操作（替代原 JSON 文件读写） ────────────────────

def _dbAddConversation(
    db: Session, userId: int, conversationId: str, title: str
) -> None:
    """新增一条会话记录到数据库"""
    conv = JsonPromptConversation(
        user_id=userId,
        conversation_id=conversationId,
        title=title,
    )
    db.add(conv)
    db.commit()


def _dbUpdateConversationTime(
    db: Session, userId: int, conversationId: str
) -> None:
    """更新会话的最后活跃时间"""
    conv = db.query(JsonPromptConversation).filter(
        JsonPromptConversation.user_id == userId,
        JsonPromptConversation.conversation_id == conversationId,
    ).first()
    if conv:
        conv.updated_at = datetime.utcnow()
        db.commit()


def _dbGetConversations(db: Session, userId: int) -> list[JsonPromptConversation]:
    """获取用户的所有会话，按更新时间倒序"""
    return db.query(JsonPromptConversation).filter(
        JsonPromptConversation.user_id == userId,
    ).order_by(JsonPromptConversation.updated_at.desc()).all()


def _dbDeleteConversation(
    db: Session, userId: int, conversationId: str
) -> bool:
    """
    删除一条会话记录
    NOTE: 只删本地索引，Coze 平台数据不做删除
    """
    deleted = db.query(JsonPromptConversation).filter(
        JsonPromptConversation.user_id == userId,
        JsonPromptConversation.conversation_id == conversationId,
    ).delete()
    db.commit()
    return deleted > 0


def _getCozeClient() -> Coze:
    """
    获取 Coze 客户端实例
    NOTE: 每次调用创建新实例以避免连接池问题
    """
    if not COZE_API_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="COZE_API_TOKEN not configured in .env"
        )
    return Coze(
        auth=TokenAuth(token=COZE_API_TOKEN),
        base_url=COZE_CN_BASE_URL,
    )


# ── 请求/响应模型 ──────────────────────────────────────────────

class ChatRequest(BaseModel):
    """对话请求"""
    message: str = Field(..., description="用户消息内容")
    conversationId: Optional[str] = Field(
        default=None,
        description="会话ID，传入则续聊，不传则新建会话"
    )
    imageFileId: Optional[str] = Field(
        default=None,
        description="Coze 文件ID（图片上传后返回），用于一键反推等图片相关功能"
    )


class ConversationInfo(BaseModel):
    """会话信息"""
    conversationId: str
    title: str
    createdAt: str
    updatedAt: str


# ── API 路由 ────────────────────────────────────────────────────

@router.post("/upload-image")
async def uploadImage(
    file: UploadFile = FastAPIFile(...),
    currentUser: User = Depends(getCurrentUser),
):
    """
    上传图片到 Coze 文件服务
    NOTE: 前端选择图片后先调用此接口上传到 Coze，获取 file_id，
    再在 chat/stream 请求中携带 imageFileId 发送带图片的消息。
    """
    coze = _getCozeClient()

    try:
        fileContent = await file.read()
        # NOTE: cozepy files.upload 支持 (filename, bytes) 元组格式
        result = coze.files.upload(
            file=(file.filename or "image.png", fileContent),
        )
        logger.info(f"Image uploaded to Coze: file_id={result.id}")
        return {"fileId": result.id, "fileName": file.filename}
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Image upload failed: {e}")


@router.post("/chat/stream")
async def chatStream(
    req: ChatRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    流式对话接口 — SSE (Server-Sent Events)
    NOTE: 后端通过 cozepy SDK 调用 Coze 流式接口，
    将事件逐条转译为 SSE 格式推给前端。
    user_id 从 JWT Token 中解析，实现用户级别的会话隔离。
    """
    coze = _getCozeClient()
    # NOTE: Phase 2 迁移：从 JWT 解析真实用户 ID（替代原硬编码 "admin"）
    userId = currentUser.id
    username = currentUser.username

    def eventGenerator():
        """
        SSE 事件生成器（同步）
        NOTE: 使用同步 coze.chat.stream() 然后逐条 yield SSE 事件
        FIXME: cozepy 当前版本的 stream 是同步迭代器，
        必须使用同步生成器（def 而非 async def），
        Starlette 会自动在线程池中运行同步生成器，避免阻塞 asyncio 事件循环。
        """
        try:
            # 构建消息：纯文本 或 图片+文本
            if req.imageFileId:
                # NOTE: 带图片的消息使用 object_string 格式
                msgObjects = [
                    MessageObjectString.build_image(file_id=req.imageFileId),
                ]
                if req.message:
                    msgObjects.append(MessageObjectString.build_text(req.message))
                userMessage = Message.build_user_question_objects(msgObjects)
            else:
                userMessage = Message.build_user_question_text(req.message)

            streamKwargs = {
                "bot_id": COZE_BOT_ID,
                "user_id": username,
                "auto_save_history": True,
                "additional_messages": [userMessage],
            }
            # 续聊：传入 conversation_id
            if req.conversationId:
                streamKwargs["conversation_id"] = req.conversationId

            stream = coze.chat.stream(**streamKwargs)

            conversationId = req.conversationId
            chatId = None
            isNewConversation = not req.conversationId

            for event in stream:
                # 流式文本片段
                if event.event == ChatEventType.CONVERSATION_MESSAGE_DELTA:
                    # NOTE: cozepy 的 content 可能是 MessageContent 对象，
                    # 必须强制转为 str 避免 JSON 序列化时变成 [object Object]
                    content = str(event.message.content) if event.message.content else ""
                    if content:
                        yield _sseFormat("message_delta", {"content": content})

                # 单条消息完成
                elif event.event == ChatEventType.CONVERSATION_MESSAGE_COMPLETED:
                    pass  # 暂不需要单独处理

                # 整个 Chat 完成
                elif event.event == ChatEventType.CONVERSATION_CHAT_COMPLETED:
                    if event.chat:
                        conversationId = event.chat.conversation_id
                        chatId = event.chat.id

                # 会话创建事件
                elif event.event == ChatEventType.CONVERSATION_CHAT_CREATED:
                    if event.chat:
                        conversationId = event.chat.conversation_id
                        chatId = event.chat.id

            # 对话结束后持久化会话记录到数据库
            if conversationId:
                # NOTE: 同步生成器在线程池中运行，需要独立的数据库 Session
                from database.connection import SessionLocal
                threadDb = SessionLocal()
                try:
                    if isNewConversation:
                        # 取用户消息前 20 字符作为标题
                        title = req.message[:20]
                        if len(req.message) > 20:
                            title += "..."
                        _dbAddConversation(threadDb, userId, conversationId, title)
                    else:
                        _dbUpdateConversationTime(threadDb, userId, conversationId)
                finally:
                    threadDb.close()

            # 发送完成事件
            yield _sseFormat("chat_completed", {
                "conversation_id": conversationId or "",
                "chat_id": chatId or "",
            })

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield _sseFormat("error", {"message": str(e)})

    return StreamingResponse(
        eventGenerator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def getConversations(
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    获取当前用户的会话历史列表
    NOTE: 按 updated_at 倒序返回，RLS 级别的用户隔离
    """
    convs = _dbGetConversations(db, currentUser.id)
    return {
        "conversations": [
            ConversationInfo(
                conversationId=c.conversation_id,
                title=c.title,
                createdAt=c.created_at.isoformat() if c.created_at else "",
                updatedAt=c.updated_at.isoformat() if c.updated_at else "",
            )
            for c in convs
        ]
    }


@router.get("/conversations/{conversationId}/messages")
async def getConversationMessages(
    conversationId: str,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    获取某会话的消息历史
    NOTE: 先校验该会话属于当前用户，再通过 Coze API 拉取消息列表
    HACK: Coze 的带图片消息使用 object_string 格式（JSON 数组），
    需要解析出文本和图片 URL 分别返回，否则前端会显示原始 JSON
    """
    # NOTE: 校验会话归属权（用户只能访问自己的会话）
    conv = db.query(JsonPromptConversation).filter(
        JsonPromptConversation.user_id == currentUser.id,
        JsonPromptConversation.conversation_id == conversationId,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    coze = _getCozeClient()

    try:
        # NOTE: cozepy SDK 获取消息列表
        messages = coze.conversations.messages.list(
            conversation_id=conversationId,
        )

        result = []
        for msg in messages:
            # 过滤出 answer 和 question 类型的消息
            if msg.role in ("assistant", "user"):
                rawContent = str(msg.content) if msg.content else ""
                textContent = rawContent
                imageUrl = None

                # NOTE: 尝试解析 object_string 格式的混合消息
                # Coze 的图片+文本消息内容是一个 JSON 数组：
                # [{"type":"image","file_url":"..."},{"type":"text","text":"..."}]
                if rawContent.startswith("["):
                    try:
                        parts = json.loads(rawContent)
                        if isinstance(parts, list):
                            textParts = []
                            for part in parts:
                                if isinstance(part, dict):
                                    if part.get("type") == "text":
                                        textParts.append(part.get("text", ""))
                                    elif part.get("type") == "image":
                                        imageUrl = part.get("file_url", "")
                            textContent = " ".join(textParts).strip()
                    except (json.JSONDecodeError, TypeError):
                        # 不是 JSON，保持原始文本
                        pass

                result.append({
                    "role": msg.role,
                    "content": textContent,
                    "imageUrl": imageUrl,
                    "created_at": msg.created_at if hasattr(msg, "created_at") else "",
                })

        # NOTE: Coze API 的 messages.list() 默认按时间倒序返回（最新消息在前），
        # 前端聊天界面需要正序显示（最早消息在上），必须反转
        result.reverse()
        return {"messages": result}

    except Exception as e:
        logger.error(f"Failed to fetch messages for {conversationId}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch conversation messages: {e}"
        )


@router.delete("/conversations/{conversationId}")
async def deleteConversation(
    conversationId: str,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    删除一个会话
    NOTE: 从数据库中移除记录（Coze 平台的数据不做删除）
          只允许删除自己的会话（用户隔离）
    """
    deleted = _dbDeleteConversation(db, currentUser.id, conversationId)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True, "deleted": conversationId}


# ── 工具函数 ────────────────────────────────────────────────────

def _sseFormat(event: str, data: dict) -> str:
    """
    格式化 SSE 事件
    NOTE: SSE 协议要求每个事件以两个换行符结尾
    """
    jsonStr = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {jsonStr}\n\n"
