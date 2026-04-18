"""
积分业务逻辑

NOTE: 处理积分消费、充值、调整等所有积分变动操作
      每次变动都会写入 credit_records 流水表
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func

from models.user import User
from models.credit import CreditRecord, CreditSchedule
from models.tool_log import ToolUsageLog

logger = logging.getLogger(__name__)


def consumeCredits(
    db: Session,
    user: User,
    toolName: str,
    credits: int,
    description: str = "",
) -> CreditRecord:
    """
    工具消费积分

    NOTE: 检查余额 → 扣减 → 记录流水 → 记录工具使用日志
    @raises ValueError 余额不足
    """
    if user.credits < credits:
        raise ValueError(f"Insufficient credits: have {user.credits}, need {credits}")

    user.credits -= credits
    newBalance = user.credits

    record = CreditRecord(
        user_id=user.id,
        type="consume",
        amount=-credits,
        balance=newBalance,
        description=description or f"工具消费: {toolName}",
    )
    db.add(record)

    # NOTE: 同步写入工具使用日志（管理后台统计用）
    usageLog = ToolUsageLog(
        user_id=user.id,
        tool_name=toolName,
        credits=credits,
    )
    db.add(usageLog)

    db.commit()
    db.refresh(record)
    logger.info(f"Credits consumed: user={user.username}, tool={toolName}, credits={credits}")
    return record


def addCredits(
    db: Session,
    user: User,
    amount: int,
    recordType: str,
    description: str = "",
) -> CreditRecord:
    """
    增加积分（充值、退款、管理员调整等）

    @param recordType 变动类型（recharge / refund / admin_add / upgrade 等）
    """
    user.credits += amount
    newBalance = user.credits

    record = CreditRecord(
        user_id=user.id,
        type=recordType,
        amount=amount,
        balance=newBalance,
        description=description,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(f"Credits added: user={user.username}, amount={amount}, type={recordType}")
    return record


def deductCredits(
    db: Session,
    user: User,
    amount: int,
    recordType: str,
    description: str = "",
) -> CreditRecord:
    """
    扣减积分（管理员手动扣减等）

    NOTE: 扣减后余额不允许为负，由数据库 CHECK 约束保底
    """
    user.credits = max(0, user.credits - amount)
    newBalance = user.credits

    record = CreditRecord(
        user_id=user.id,
        type=recordType,
        amount=-amount,
        balance=newBalance,
        description=description,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(f"Credits deducted: user={user.username}, amount={amount}, type={recordType}")
    return record


def listCreditRecords(
    db: Session,
    userId: int | None = None,
    page: int = 1,
    pageSize: int = 20,
    recordType: str | None = None,
) -> tuple[list[CreditRecord], int]:
    """分页查询积分流水"""
    query = db.query(CreditRecord)
    if userId:
        query = query.filter(CreditRecord.user_id == userId)
    if recordType:
        query = query.filter(CreditRecord.type == recordType)

    total = query.count()
    items = (
        query
        .order_by(CreditRecord.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


def getTotalCreditsConsumed(db: Session) -> int:
    """获取全平台总消费积分"""
    result = (
        db.query(func.sum(func.abs(CreditRecord.amount)))
        .filter(CreditRecord.type == "consume")
        .scalar()
    )
    return result or 0


def getTodayCreditsConsumed(db: Session) -> int:
    """获取今日消费积分"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    result = (
        db.query(func.sum(func.abs(CreditRecord.amount)))
        .filter(CreditRecord.type == "consume")
        .filter(CreditRecord.created_at >= today)
        .scalar()
    )
    return result or 0


def getTotalToolCalls(db: Session) -> int:
    """获取全平台工具调用总次数"""
    return db.query(func.count(ToolUsageLog.id)).scalar() or 0


def getTodayToolCalls(db: Session) -> int:
    """获取今日工具调用次数"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(ToolUsageLog.id))
        .filter(ToolUsageLog.created_at >= today)
        .scalar()
    ) or 0
