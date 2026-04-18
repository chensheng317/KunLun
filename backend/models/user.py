"""
用户主表 ORM 模型

NOTE: 合并原 localStorage 的 kunlun_users / _credits / _membership_expiry /
      _first_bonus_claimed / _online_heartbeats 共 5 个 Key
"""
from datetime import datetime
from sqlalchemy import (
    BigInteger, String, Integer, Boolean, Text, CheckConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # NOTE: bcrypt 哈希后的密码，永不通过 API 返回前端
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="guest")
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    membership_expiry: Mapped[datetime | None] = mapped_column(TIMESTAMP, nullable=True)
    # NOTE: JSONB 存储已领取首次升级加赠的角色列表，如 ["pro","ultra"]
    first_bonus_claimed: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_heartbeat: Mapped[datetime | None] = mapped_column(TIMESTAMP, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # -- 关系定义 --
    orders = relationship("Order", back_populates="user", lazy="dynamic")
    credit_records = relationship("CreditRecord", back_populates="user", lazy="dynamic")
    credit_schedules = relationship("CreditSchedule", back_populates="user", lazy="dynamic")
    tool_usage_logs = relationship("ToolUsageLog", back_populates="user", lazy="dynamic")
    factory_assets = relationship("FactoryAsset", back_populates="user", lazy="dynamic")
    factory_history = relationship("FactoryHistory", back_populates="user", lazy="dynamic")
    worker_history = relationship("WorkerHistory", back_populates="user", lazy="dynamic")
    custom_libraries = relationship("CustomLibrary", back_populates="user", lazy="dynamic")
    preferences = relationship("UserPreference", back_populates="user", lazy="dynamic")
    conversations = relationship("JsonPromptConversation", back_populates="user", lazy="dynamic")

    __table_args__ = (
        CheckConstraint("role IN ('super_admin','admin','ultra','pro','normal','guest')", name="ck_users_role"),
        CheckConstraint("credits >= 0", name="ck_users_credits_non_negative"),
        Index("idx_users_role", "role"),
        Index("idx_users_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"
