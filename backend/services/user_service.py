"""
用户管理业务逻辑

NOTE: 管理后台的用户 CRUD + 角色/积分/禁用管理
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import func

from models.user import User

logger = logging.getLogger(__name__)


def getUserById(db: Session, userId: int) -> User | None:
    """根据 ID 获取用户"""
    return db.query(User).filter(User.id == userId).first()


def getUserByUsername(db: Session, username: str) -> User | None:
    """根据用户名获取用户"""
    return db.query(User).filter(User.username == username).first()


def listUsers(
    db: Session,
    page: int = 1,
    pageSize: int = 20,
    role: str | None = None,
    search: str | None = None,
) -> tuple[list[User], int]:
    """
    分页获取用户列表

    @param db 数据库会话
    @param page 页码
    @param pageSize 每页条数
    @param role 可选角色筛选
    @param search 可选用户名搜索
    @returns (用户列表, 总数)
    """
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if search:
        query = query.filter(User.username.ilike(f"%{search}%"))

    total = query.count()
    items = (
        query
        .order_by(User.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


def updateUser(
    db: Session,
    user: User,
    role: str | None = None,
    credits: int | None = None,
    disabled: bool | None = None,
) -> User:
    """
    管理员更新用户信息

    NOTE: 仅允许更新 role / credits / disabled 字段
    """
    if role is not None:
        user.role = role
    if credits is not None:
        user.credits = credits
    if disabled is not None:
        user.disabled = disabled
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    logger.info(f"User updated: {user.username} (role={user.role}, credits={user.credits})")
    return user


def changeUsername(db: Session, user: User, newUsername: str) -> User:
    """
    用户自行修改用户名

    NOTE: 校验新用户名唯一性后更新
    @param db 数据库会话
    @param user 当前用户对象
    @param newUsername 新用户名
    @returns 更新后的 User 对象
    @raises ValueError 用户名已被占用
    """
    existing = db.query(User).filter(User.username == newUsername).first()
    if existing:
        raise ValueError(f"Username '{newUsername}' already exists")

    oldUsername = user.username
    user.username = newUsername
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    logger.info(f"Username changed: {oldUsername} -> {newUsername}")
    return user


def updateHeartbeat(db: Session, user: User) -> None:
    """更新用户在线心跳"""
    user.last_heartbeat = datetime.now(timezone.utc)
    db.commit()


def getTotalUserCount(db: Session) -> int:
    """获取用户总数"""
    return db.query(func.count(User.id)).scalar() or 0


def getTodayNewUserCount(db: Session) -> int:
    """获取今日新注册用户数"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return db.query(func.count(User.id)).filter(User.created_at >= today).scalar() or 0
