"""
认证业务逻辑

NOTE: 处理注册、登录、改密的核心逻辑
      密码校验和 JWT 签发均在此层完成
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models.user import User
from auth.security import hashPassword, verifyPassword
from auth.jwt_handler import createAccessToken

logger = logging.getLogger(__name__)


def registerUser(db: Session, username: str, password: str) -> User:
    """
    用户注册

    NOTE: 检查用户名唯一性 → bcrypt 哈希 → 创建记录 → 写入注册赠送积分
    @param db 数据库会话
    @param username 用户名
    @param password 明文密码
    @returns 新创建的 User 对象
    @raises ValueError 用户名已存在
    """
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise ValueError(f"Username '{username}' already exists")

    user = User(
        username=username,
        password_hash=hashPassword(password),
        role="normal",
        credits=100,  # NOTE: 注册赠送 100 积分
    )
    db.add(user)
    db.flush()

    # NOTE: 写入注册赠送积分流水
    from models.credit import CreditRecord
    record = CreditRecord(
        user_id=user.id,
        type="register_bonus",
        amount=100,
        balance=100,
        description="注册赠送积分",
    )
    db.add(record)
    db.commit()
    db.refresh(user)

    logger.info(f"User registered: {username} (id={user.id})")
    return user


def authenticateUser(db: Session, username: str, password: str) -> User | None:
    """
    用户登录验证

    @param db 数据库会话
    @param username 用户名
    @param password 明文密码
    @returns 验证通过返回 User 对象，否则返回 None
    """
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        return None
    if not verifyPassword(password, user.password_hash):
        return None
    if user.disabled:
        return None

    # NOTE: 更新最后心跳时间
    user.last_heartbeat = datetime.now(timezone.utc)
    db.commit()
    return user


def createTokenForUser(user: User) -> str:
    """
    为用户签发 JWT Token

    @param user 已验证的 User 对象
    @returns JWT Token 字符串
    """
    return createAccessToken({
        "sub": user.username,
        "role": user.role,
        "uid": user.id,
    })


def changePassword(db: Session, user: User, oldPassword: str, newPassword: str) -> bool:
    """
    修改密码

    @param db 数据库会话
    @param user 当前用户
    @param oldPassword 旧密码
    @param newPassword 新密码
    @returns 是否修改成功
    """
    if not verifyPassword(oldPassword, user.password_hash):
        return False
    user.password_hash = hashPassword(newPassword)
    db.commit()
    logger.info(f"Password changed for user: {user.username}")
    return True
