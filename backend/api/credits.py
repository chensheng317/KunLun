"""
积分路由

NOTE: 消费 / 查询流水 / 管理员手动调整
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentUser, getCurrentAdminUser
from models.user import User
from schemas.credit import (
    CreditConsumeRequest,
    CreditAdjustRequest,
    CreditRecordResponse,
    CreditRecordListResponse,
)
from services import credit_service, admin_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/credits", tags=["积分管理"])


@router.post("/consume", response_model=CreditRecordResponse)
def consumeCredits(
    req: CreditConsumeRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    工具消费积分

    NOTE: 前端调用工具前调用此接口扣费
    """
    try:
        record = credit_service.consumeCredits(
            db, currentUser, req.toolName, req.credits,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(e))
    return record


@router.get("/records", response_model=CreditRecordListResponse)
def listMyRecords(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    type: str | None = Query(None),
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """查询当前用户的积分流水"""
    items, total = credit_service.listCreditRecords(
        db, userId=currentUser.id, page=page, pageSize=pageSize, recordType=type,
    )
    return CreditRecordListResponse(total=total, page=page, pageSize=pageSize, items=items)


@router.get("/records/all", response_model=CreditRecordListResponse)
def listAllRecords(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    userId: int | None = Query(None),
    type: str | None = Query(None),
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员查询所有积分流水"""
    items, total = credit_service.listCreditRecords(
        db, userId=userId, page=page, pageSize=pageSize, recordType=type,
    )
    return CreditRecordListResponse(total=total, page=page, pageSize=pageSize, items=items)


@router.post("/adjust", response_model=CreditRecordResponse)
def adjustCredits(
    req: CreditAdjustRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """
    管理员手动调整积分

    NOTE: amount 正数=增加，负数=扣减
    """
    from services.user_service import getUserById
    targetUser = getUserById(db, req.userId)
    if targetUser is None:
        raise HTTPException(status_code=404, detail="目标用户不存在")

    if req.amount > 0:
        record = credit_service.addCredits(
            db, targetUser, req.amount, "admin_add",
            description=req.description or f"管理员 {admin.username} 手动增加",
        )
    else:
        record = credit_service.deductCredits(
            db, targetUser, abs(req.amount), "admin_deduct",
            description=req.description or f"管理员 {admin.username} 手动扣减",
        )

    # NOTE: 记录管理员操作日志
    admin_service.addAdminLog(
        db,
        operator=admin.username,
        action="adjust_credits",
        target=targetUser.username,
        detail=f"amount={req.amount}, reason={req.description}",
    )
    return record


@router.get("/balance")
def getBalance(currentUser: User = Depends(getCurrentUser)):
    """获取当前用户积分余额"""
    return {"credits": currentUser.credits}
