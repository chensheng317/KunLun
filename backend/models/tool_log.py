"""
工具调用日志 ORM 模型

NOTE: 记录每次工具调用的积分消耗，用于管理后台统计面板
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, Integer, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class ToolUsageLog(Base):
    __tablename__ = "tool_usage_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(50), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="tool_usage_logs")

    __table_args__ = (
        Index("idx_tool_usage_logs_user_id", "user_id"),
        Index("idx_tool_usage_logs_tool_name", "tool_name"),
        Index("idx_tool_usage_logs_created_at", "created_at"),
    )
