"""
订单路由

NOTE: 创建 / 查询 / 状态变更 / 删除
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentUser, getCurrentAdminUser
from models.user import User
from schemas.order import (
    OrderCreateRequest,
    OrderResponse,
    OrderListResponse,
    OrderStatusUpdateRequest,
)
from services import order_service, admin_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/orders", tags=["订单管理"])


def _fillUsername(order, db: Session) -> dict:
    """
    将 ORM Order 转为 dict 并注入 username

    NOTE: Order.user 关系已存在，直接通过 relationship 获取用户名
    """
    data = {c.name: getattr(order, c.name) for c in order.__table__.columns}
    if order.user:
        data["username"] = order.user.username
    else:
        data["username"] = f"user#{order.user_id}"
    return data


@router.post("", response_model=OrderResponse, status_code=201)
def createOrder(
    req: OrderCreateRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    创建订单（充值/升级）

    NOTE: 当前版本为模拟支付，创建即完成
    """
    order = order_service.createOrder(
        db,
        user=currentUser,
        orderType=req.type,
        amount=float(req.amount),
        credits=req.credits,
        targetRole=req.targetRole,
        planName=req.planName,
        hasFirstBonus=req.hasFirstBonus,
        firstBonusCredits=req.firstBonusCredits,
    )
    return _fillUsername(order, db)


@router.get("/my", response_model=OrderListResponse)
def listMyOrders(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """查询当前用户的订单"""
    items, total = order_service.listOrders(
        db, userId=currentUser.id, page=page, pageSize=pageSize,
    )
    return OrderListResponse(
        total=total, page=page, pageSize=pageSize,
        items=[_fillUsername(o, db) for o in items],
    )


@router.get("", response_model=OrderListResponse)
def listAllOrders(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    userId: int | None = Query(None),
    status: str | None = Query(None),
    orderType: str | None = Query(None, alias="type"),
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员查询所有订单，支持按用户、状态、类型过滤"""
    items, total = order_service.listOrders(
        db, userId=userId, status=status, orderType=orderType,
        page=page, pageSize=pageSize,
    )
    return OrderListResponse(
        total=total, page=page, pageSize=pageSize,
        items=[_fillUsername(o, db) for o in items],
    )


@router.put("/{orderId}/status", response_model=OrderResponse)
def updateOrderStatus(
    orderId: int,
    req: OrderStatusUpdateRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员更新订单状态"""
    order = order_service.updateOrderStatus(db, orderId, req.status)
    if order is None:
        raise HTTPException(status_code=404, detail="订单不存在")

    admin_service.addAdminLog(
        db,
        operator=admin.username,
        action="update_order_status",
        target=f"order#{orderId}",
        detail=f"new_status={req.status}",
    )
    return _fillUsername(order, db)


@router.delete("/{orderId}", status_code=204)
def deleteOrderById(
    orderId: int,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员删除订单"""
    success = order_service.deleteOrder(db, orderId)
    if not success:
        raise HTTPException(status_code=404, detail="订单不存在")

    admin_service.addAdminLog(
        db,
        operator=admin.username,
        action="delete_order",
        target=f"order#{orderId}",
        detail="order deleted",
    )
