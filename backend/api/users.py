"""
用户管理路由

NOTE: 管理员专用接口（用户列表、角色变更、禁用、心跳等）
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentUser, getCurrentAdminUser
from models.user import User
from schemas.user import UserDetailResponse, UserListResponse, UserUpdateRequest
from services import user_service, admin_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["用户管理"])


@router.get("", response_model=UserListResponse)
def listUsers(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=1000),
    role: str | None = Query(None),
    search: str | None = Query(None),
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员获取用户列表"""
    items, total = user_service.listUsers(db, page, pageSize, role, search)
    return UserListResponse(total=total, page=page, pageSize=pageSize, items=items)


@router.get("/{userId}", response_model=UserDetailResponse)
def getUser(
    userId: int,
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员获取用户详情"""
    user = user_service.getUserById(db, userId)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.put("/{userId}", response_model=UserDetailResponse)
def updateUser(
    userId: int,
    req: UserUpdateRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员更新用户（角色/积分/禁用状态）"""
    user = user_service.getUserById(db, userId)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    updated = user_service.updateUser(db, user, req.role, req.credits, req.disabled)

    # NOTE: 写入管理员操作日志
    admin_service.addAdminLog(
        db,
        operator=admin.username,
        action="update_user",
        target=user.username,
        detail=f"role={req.role}, credits={req.credits}, disabled={req.disabled}",
    )
    return updated


@router.post("/heartbeat")
def heartbeat(
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """更新用户在线心跳"""
    user_service.updateHeartbeat(db, currentUser)
    return {"status": "ok"}
