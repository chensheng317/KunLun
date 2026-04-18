"""
管理后台路由

NOTE: 数据概览 / 管理员日志 / 公告管理
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentAdminUser
from models.user import User
from schemas.admin import (
    AnnouncementCreateRequest, AnnouncementUpdateRequest, AnnouncementResponse,
    AdminLogListResponse,
    DataOverviewResponse,
)
from services import admin_service, user_service, credit_service, order_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["管理后台"])


@router.get("/overview", response_model=DataOverviewResponse)
def getOverview(
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理后台数据概览"""
    return DataOverviewResponse(
        totalUsers=user_service.getTotalUserCount(db),
        totalCreditsConsumed=credit_service.getTotalCreditsConsumed(db),
        totalToolCalls=credit_service.getTotalToolCalls(db),
        todayCreditsConsumed=credit_service.getTodayCreditsConsumed(db),
        todayToolCalls=credit_service.getTodayToolCalls(db),
        todayNewUsers=user_service.getTodayNewUserCount(db),
        todayOrders=order_service.getTodayOrderCount(db),
    )


@router.get("/logs", response_model=AdminLogListResponse)
def listLogs(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """查询管理员操作日志"""
    items, total = admin_service.listAdminLogs(db, page, pageSize)
    return AdminLogListResponse(total=total, page=page, pageSize=pageSize, items=items)


# --- 公告管理 ---
@router.get("/announcements", response_model=list[AnnouncementResponse])
def listAnnouncements(
    _admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """管理员获取所有公告（含禁用的）"""
    return admin_service.listAnnouncements(db, onlyEnabled=False)


@router.post("/announcements", response_model=AnnouncementResponse, status_code=201)
def createAnnouncement(
    req: AnnouncementCreateRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """创建公告"""
    ann = admin_service.createAnnouncement(
        db,
        title=req.title, content=req.content, type=req.type,
        enabled=req.enabled, sort_order=req.sortOrder,
    )
    admin_service.addAdminLog(db, admin.username, "create_announcement", f"#{ann.id}")
    return ann


@router.put("/announcements/{annId}", response_model=AnnouncementResponse)
def updateAnnouncement(
    annId: int,
    req: AnnouncementUpdateRequest,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """更新公告"""
    ann = admin_service.updateAnnouncement(
        db, annId,
        title=req.title, content=req.content, type=req.type,
        enabled=req.enabled, sort_order=req.sortOrder,
    )
    if ann is None:
        raise HTTPException(status_code=404, detail="公告不存在")
    admin_service.addAdminLog(db, admin.username, "update_announcement", f"#{annId}")
    return ann


@router.delete("/announcements/{annId}")
def deleteAnnouncement(
    annId: int,
    admin: User = Depends(getCurrentAdminUser),
    db: Session = Depends(get_db),
):
    """删除公告"""
    if not admin_service.deleteAnnouncement(db, annId):
        raise HTTPException(status_code=404, detail="公告不存在")
    admin_service.addAdminLog(db, admin.username, "delete_announcement", f"#{annId}")
    return {"message": "删除成功"}
