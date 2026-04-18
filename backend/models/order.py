"""
订单记录 ORM 模型

NOTE: 对应 localStorage kunlun_orders，记录充值和升级两类订单
"""
from datetime import datetime
from sqlalchemy import (
    BigInteger, String, Integer, Boolean, Numeric, ForeignKey,
    CheckConstraint, Index,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    plan_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    has_first_bonus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    first_bonus_credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # -- 关系 --
    user = relationship("User", back_populates="orders")

    __table_args__ = (
        CheckConstraint("type IN ('upgrade','recharge')", name="ck_orders_type"),
        CheckConstraint("status IN ('pending','completed','refunded','cancelled')", name="ck_orders_status"),
        CheckConstraint("amount >= 0", name="ck_orders_amount_non_negative"),
        Index("idx_orders_user_id", "user_id"),
        Index("idx_orders_status", "status"),
        Index("idx_orders_created_at", "created_at"),
    )
