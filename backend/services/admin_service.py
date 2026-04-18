"""
管理后台业务逻辑

NOTE: 处理公告、站点配置、工具配置、管理员日志等
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models.config import Announcement, SiteConfig, ToolConfig
from models.admin_log import AdminLog

logger = logging.getLogger(__name__)


# --- 管理员操作日志 ---
def addAdminLog(
    db: Session,
    operator: str,
    action: str,
    target: str | None = None,
    detail: str | None = None,
) -> AdminLog:
    """
    写入管理员操作审计日志

    NOTE: 此表只增不删（提醒.md #16 第二层安全要求）
    """
    log = AdminLog(operator=operator, action=action, target=target, detail=detail)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def listAdminLogs(
    db: Session,
    page: int = 1,
    pageSize: int = 20,
) -> tuple[list[AdminLog], int]:
    """分页查询管理员日志"""
    query = db.query(AdminLog)
    total = query.count()
    items = (
        query
        .order_by(AdminLog.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


# --- 公告管理 ---
def listAnnouncements(db: Session, onlyEnabled: bool = False) -> list[Announcement]:
    """获取公告列表"""
    query = db.query(Announcement)
    if onlyEnabled:
        query = query.filter(Announcement.enabled == True)
    return query.order_by(Announcement.sort_order.asc(), Announcement.created_at.desc()).all()


def createAnnouncement(db: Session, **kwargs) -> Announcement:
    """创建公告"""
    ann = Announcement(**kwargs)
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


def updateAnnouncement(db: Session, annId: int, **kwargs) -> Announcement | None:
    """更新公告"""
    ann = db.query(Announcement).filter(Announcement.id == annId).first()
    if ann is None:
        return None
    for key, val in kwargs.items():
        if val is not None and hasattr(ann, key):
            setattr(ann, key, val)
    ann.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ann)
    return ann


def deleteAnnouncement(db: Session, annId: int) -> bool:
    """删除公告"""
    ann = db.query(Announcement).filter(Announcement.id == annId).first()
    if ann is None:
        return False
    db.delete(ann)
    db.commit()
    return True


# --- 站点配置 ---
def getSiteConfig(db: Session, key: str) -> SiteConfig | None:
    """获取单个站点配置"""
    return db.query(SiteConfig).filter(SiteConfig.config_key == key).first()


def getAllSiteConfigs(db: Session) -> list[SiteConfig]:
    """获取所有站点配置"""
    return db.query(SiteConfig).all()


def upsertSiteConfig(db: Session, key: str, value) -> SiteConfig:
    """
    插入或更新站点配置

    NOTE: 使用 upsert 语义（存在则更新，不存在则插入）
    """
    config = db.query(SiteConfig).filter(SiteConfig.config_key == key).first()
    if config:
        config.config_value = value
        config.updated_at = datetime.now(timezone.utc)
    else:
        config = SiteConfig(config_key=key, config_value=value)
        db.add(config)
    db.commit()
    db.refresh(config)
    return config


# --- 工具配置 ---
def listToolConfigs(db: Session) -> list[ToolConfig]:
    """获取所有工具配置"""
    return db.query(ToolConfig).all()


def getToolConfig(db: Session, toolId: str) -> ToolConfig | None:
    """根据 tool_id 获取工具配置"""
    return db.query(ToolConfig).filter(ToolConfig.tool_id == toolId).first()


def updateToolConfig(db: Session, toolId: str, **kwargs) -> ToolConfig | None:
    """更新工具配置"""
    config = db.query(ToolConfig).filter(ToolConfig.tool_id == toolId).first()
    if config is None:
        return None
    for key, val in kwargs.items():
        if val is not None:
            # NOTE: camelCase → snake_case 映射
            dbKey = {
                "creditCost": "credit_cost",
                "extraConfig": "extra_config",
            }.get(key, key)
            if hasattr(config, dbKey):
                setattr(config, dbKey, val)
    config.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(config)
    return config
