"""
数字员工任务历史 ORM 模型

NOTE: 对应 localStorage kunlun_worker_history_{username}
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class WorkerHistory(Base):
    __tablename__ = "worker_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    command: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    duration: Mapped[str | None] = mapped_column(String(50), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    log_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    device_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="worker_history")

    __table_args__ = (
        Index("idx_worker_history_user_id", "user_id"),
        Index("idx_worker_history_created_at", "created_at"),
    )
