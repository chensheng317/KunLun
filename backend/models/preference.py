"""
用户偏好设置 ORM 模型

NOTE: 主题和语言保留 localStorage（纯前端），此表仅存需要服务端同步的偏好
      通过 (user_id, pref_key) 唯一约束确保每个用户每个偏好键只有一条记录
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, ForeignKey, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    pref_key: Mapped[str] = mapped_column(String(50), nullable=False)
    pref_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="preferences")

    __table_args__ = (
        UniqueConstraint("user_id", "pref_key", name="uq_user_preferences_user_key"),
        Index("idx_user_preferences_user_key", "user_id", "pref_key", unique=True),
    )
