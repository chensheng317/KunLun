"""
管理员操作审计日志 ORM 模型

NOTE: 提醒.md #16 要求——此表不可删除记录（仅 INSERT + SELECT）
      Phase 2 通过 PostgreSQL REVOKE 实现
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, Text, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    operator: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target: Mapped[str | None] = mapped_column(String(100), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_admin_logs_operator", "operator"),
        Index("idx_admin_logs_created_at", "created_at"),
    )
