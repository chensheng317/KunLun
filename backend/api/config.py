"""
配置路由

NOTE: 公开接口（公告、工具配置）+ 管理员接口（站点配置、工具配置修改）
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentAdminUser
from models.user import User
from schemas.admin import (
    AnnouncementResponse,
    SiteConfigResponse, SiteConfigUpdateRequest,
    ToolConfigResponse, ToolConfigUpdateRequest,
)
from services import admin_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["配置管理"])


# --- 公开接口（无需 Token） ---
@router.get("/announcements", response_model=list[AnnouncementResponse])
def getPublicAnnouncements(db: Session = Depends(get_db)):
    """获取已启用的公告列表（公开）"""
    return admin_service.listAnnouncements(db, onlyEnabled=True)


@router.get("/tools", response_model=list[ToolConfigResponse])
def getToolConfigs(db: Session = Depends(get_db)):
    """获取所有工具配置（公开，前端需要读取积分价格和开关）"""
    return admin_service.listToolConfigs(db)


@router.get("/site/{key}", response_model=SiteConfigResponse)
def getSiteConfigPublic(key: str, db: Session = Depends(get_db)):
    """
    获取单个站点配置（公开）

    NOTE: 只允许读取特定的公开配置（registration_open, maintenance_mode, pricing_config）
    """
    allowedKeys = {"registration_open", "maintenance_mode", "pricing_config"}
    if key not in allowedKeys:
        raise HTTPException(status_code=403, detail="无权访问此配置")
    config = admin_service.getSiteConfig(db, key)
    if config is None:
        raise HTTPException(status_code=404, detail="配置不存在")
    return config


# --- 管理员接口 ---
@router.get("/site", response_model=list[SiteConfigResponse])
def getAllSiteConfigs(
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员获取所有站点配置"""
    return admin_service.getAllSiteConfigs(db)


@router.put("/site/{key}", response_model=SiteConfigResponse)
def updateSiteConfig(
    key: str,
    req: SiteConfigUpdateRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员更新站点配置"""
    config = admin_service.upsertSiteConfig(db, key, req.configValue)
    admin_service.addAdminLog(db, admin.username, "update_site_config", key)
    return config


@router.put("/tools/{toolId}", response_model=ToolConfigResponse)
def updateToolConfig(
    toolId: str,
    req: ToolConfigUpdateRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员更新工具配置"""
    config = admin_service.updateToolConfig(
        db, toolId,
        name=req.name, enabled=req.enabled,
        creditCost=req.creditCost, extraConfig=req.extraConfig,
        description=req.description,
    )
    if config is None:
        raise HTTPException(status_code=404, detail="工具不存在")
    admin_service.addAdminLog(db, admin.username, "update_tool_config", toolId)
    return config
