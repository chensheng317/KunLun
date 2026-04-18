"""
FastAPI 认证依赖注入

NOTE: 提供 getCurrentUser 和 getCurrentAdminUser 两个依赖函数
      用于路由级别的身份验证和权限校验
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.jwt_handler import decodeAccessToken
from models.user import User

# NOTE: 使用 Bearer Token 方案（Header: Authorization: Bearer <token>）
_security = HTTPBearer()


def getCurrentUser(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    db: Session = Depends(get_db),
) -> User:
    """
    从请求头中提取 JWT Token 并返回当前登录用户

    NOTE: 验证失败或用户不存在 / 已禁用时抛出 401
    """
    token = credentials.credentials
    payload = decodeAccessToken(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username: str | None = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing 'sub'",
        )

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.disabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    return user


def getCurrentAdminUser(
    currentUser: User = Depends(getCurrentUser),
) -> User:
    """
    要求当前用户具有管理员权限（admin 或 super_admin）

    NOTE: 非管理员角色抛出 403
    """
    if currentUser.role not in ("admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return currentUser
