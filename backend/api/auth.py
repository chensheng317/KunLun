"""
认证路由

NOTE: 登录 / 注册 / 修改密码 / 获取当前用户
      登录注册无需 Token，其余接口需要 Bearer Token
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentUser
from models.user import User
from schemas.auth import LoginRequest, RegisterRequest, ChangePasswordRequest, ChangeUsernameRequest, TokenResponse
from schemas.user import UserResponse
from services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """
    用户登录

    NOTE: 验证用户名+密码 → 签发 JWT Token
    """
    user = auth_service.authenticateUser(db, req.username, req.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    token = auth_service.createTokenForUser(user)
    return TokenResponse(
        accessToken=token,
        username=user.username,
        role=user.role,
        credits=user.credits,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """
    用户注册

    NOTE: 注册后自动签发 Token（注册即登录），赠送 100 积分
    """
    import os

    # NOTE: 方案 C — 环境变量开关优先于数据库配置，默认关闭公网注册
    # 部署时设置 ALLOW_PUBLIC_REGISTRATION=false 即可完全阻断未授权注册
    allow_reg_env = os.getenv("ALLOW_PUBLIC_REGISTRATION", "false").lower()
    if allow_reg_env != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="公开注册暂未开放，请联系管理员获取账号",
        )

    # NOTE: 环境变量允许注册后，再检查数据库级别的注册开关
    from services.admin_service import getSiteConfig
    regConfig = getSiteConfig(db, "registration_open")
    if regConfig and regConfig.config_value is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册通道已关闭",
        )

    try:
        user = auth_service.registerUser(db, req.username, req.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    token = auth_service.createTokenForUser(user)
    return TokenResponse(
        accessToken=token,
        username=user.username,
        role=user.role,
        credits=user.credits,
    )


@router.post("/change-password")
def changePassword(
    req: ChangePasswordRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """修改当前用户密码"""
    success = auth_service.changePassword(db, currentUser, req.oldPassword, req.newPassword)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误",
        )
    return {"message": "密码修改成功"}


@router.put("/change-username", response_model=TokenResponse)
def changeUsername(
    req: ChangeUsernameRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    修改当前用户的用户名

    NOTE: 修改成功后重新签发 JWT Token（Token 中 sub 字段存储的是用户名）
    """
    from services.user_service import changeUsername as doChangeUsername
    try:
        updated = doChangeUsername(db, currentUser, req.newUsername)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    # NOTE: 用户名变更后必须重签 Token，否则旧 Token 中的 sub 字段不匹配
    newToken = auth_service.createTokenForUser(updated)
    return TokenResponse(
        accessToken=newToken,
        username=updated.username,
        role=updated.role,
        credits=updated.credits,
    )


@router.get("/me", response_model=UserResponse)
def getMe(currentUser: User = Depends(getCurrentUser)):
    """获取当前登录用户信息"""
    return currentUser
