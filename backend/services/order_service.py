"""
订单业务逻辑

NOTE: 处理充值/升级订单的创建、状态流转
      订单完成时触发积分发放和角色变更
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func

from models.order import Order
from models.user import User
from services.credit_service import addCredits

logger = logging.getLogger(__name__)


def createOrder(
    db: Session,
    user: User,
    orderType: str,
    amount: float,
    credits: int,
    targetRole: str | None = None,
    planName: str | None = None,
    hasFirstBonus: bool = False,
    firstBonusCredits: int = 0,
) -> Order:
    """
    创建订单并立即完成

    NOTE: 当前版本为模拟支付，直接标记 completed
          生产环境需接入支付回调后再 complete
    """
    order = Order(
        user_id=user.id,
        type=orderType,
        amount=amount,
        credits=credits,
        target_role=targetRole,
        plan_name=planName,
        has_first_bonus=hasFirstBonus,
        first_bonus_credits=firstBonusCredits,
        status="completed",
    )
    db.add(order)
    db.flush()

    # NOTE: 订单完成 → 发放积分
    totalCredits = credits + (firstBonusCredits if hasFirstBonus else 0)
    addCredits(
        db, user, totalCredits,
        recordType="recharge" if orderType == "recharge" else "upgrade",
        description=f"订单 #{order.id}: {planName or orderType}",
    )

    # NOTE: 升级订单 → 变更用户角色
    if orderType == "upgrade" and targetRole:
        user.role = targetRole
        # NOTE: 标记首次升级加赠
        if hasFirstBonus:
            bonusClaimed = user.first_bonus_claimed or []
            if targetRole not in bonusClaimed:
                bonusClaimed.append(targetRole)
                user.first_bonus_claimed = bonusClaimed

    db.commit()
    db.refresh(order)
    logger.info(f"Order created: #{order.id}, user={user.username}, type={orderType}")
    return order


def listOrders(
    db: Session,
    userId: int | None = None,
    status: str | None = None,
    orderType: str | None = None,
    page: int = 1,
    pageSize: int = 20,
) -> tuple[list[Order], int]:
    """分页查询订单，支持按用户、状态、类型过滤"""
    query = db.query(Order)
    if userId:
        query = query.filter(Order.user_id == userId)
    if status:
        query = query.filter(Order.status == status)
    if orderType:
        query = query.filter(Order.type == orderType)

    total = query.count()
    items = (
        query
        .order_by(Order.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


def deleteOrder(db: Session, orderId: int) -> bool:
    """删除订单记录"""
    order = db.query(Order).filter(Order.id == orderId).first()
    if order is None:
        return False
    db.delete(order)
    db.commit()
    return True


def updateOrderStatus(db: Session, orderId: int, newStatus: str) -> Order | None:
    """
    更新订单状态

    NOTE: 退款操作需要额外扣回积分（在 API 层处理）
    """
    order = db.query(Order).filter(Order.id == orderId).first()
    if order is None:
        return None
    order.status = newStatus
    order.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(order)
    return order


def getTodayOrderCount(db: Session) -> int:
    """获取今日订单数"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(Order.id))
        .filter(Order.created_at >= today)
        .scalar()
    ) or 0
