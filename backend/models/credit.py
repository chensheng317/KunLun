"""
积分变动流水 + 年付按月发放调度 ORM 模型

NOTE: credit_records 是只增不改的流水表，每条记录一次积分变动
      credit_schedules 管理年付用户的积分月发计划
"""
from datetime import datetime
from sqlalchemy import (
    BigInteger, String, Integer, ForeignKey,
    CheckConstraint, Index,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class CreditRecord(Base):
    """积分变动流水表（只增不改）"""
    __tablename__ = "credit_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    # NOTE: consume / recharge / refund / undo_refund / upgrade / schedule /
    #       admin_add / admin_deduct / register_bonus / first_upgrade_bonus
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    # NOTE: 变动后的余额快照，用于审计校验
    balance: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="credit_records")

    __table_args__ = (
        Index("idx_credit_records_user_id", "user_id"),
        Index("idx_credit_records_created_at", "created_at"),
        Index("idx_credit_records_type", "type"),
    )


class CreditSchedule(Base):
    """年付按月发放调度表"""
    __tablename__ = "credit_schedules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    monthly_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    next_distribution: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False)
    remaining_months: Mapped[int] = mapped_column(Integer, nullable=False)
    billing_cycle: Mapped[str] = mapped_column(String(10), nullable=False, default="yearly")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="credit_schedules")

    __table_args__ = (
        CheckConstraint("remaining_months >= 0", name="ck_credit_schedules_remaining"),
        CheckConstraint("monthly_amount > 0", name="ck_credit_schedules_amount"),
        Index("idx_credit_schedules_user_id", "user_id"),
        Index("idx_credit_schedules_next_distribution", "next_distribution"),
    )
