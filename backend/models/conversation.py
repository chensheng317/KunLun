"""
JSON 提示词大师对话索引 ORM 模型

NOTE: 对应提醒.md #13 的迁移要求
      仅存储会话索引（conversation_id + title），消息历史由 Coze API 维护
      user_id 外键实现用户隔离（替代原来的硬编码 "admin"）
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class JsonPromptConversation(Base):
    __tablename__ = "json_prompt_conversations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    # NOTE: Coze 平台返回的会话 ID，全局唯一
    conversation_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="新对话")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="conversations")

    __table_args__ = (
        Index("idx_json_prompt_conv_user_id", "user_id"),
        Index("idx_json_prompt_conv_updated_at", "updated_at"),
    )
