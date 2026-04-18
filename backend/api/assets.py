"""
工厂资产 / 历史路由

NOTE: 用户级数据隔离，所有操作自动绑定当前用户
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentUser
from models.user import User
from schemas.factory import (
    FactoryAssetCreateRequest, FactoryAssetResponse, FactoryAssetListResponse,
    FactoryHistoryCreateRequest, FactoryHistoryResponse, FactoryHistoryListResponse,
    WorkerHistoryCreateRequest, WorkerHistoryResponse, WorkerHistoryListResponse,
    WorkerHistoryUpdateRequest,
)
from services import factory_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assets", tags=["资产管理"])


# --- 工厂资产 ---
@router.post("/factory", response_model=FactoryAssetResponse, status_code=201)
def createAsset(
    req: FactoryAssetCreateRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """创建工厂资产记录"""
    asset = factory_service.createFactoryAsset(
        db, userId=currentUser.id,
        name=req.name, source=req.source, type=req.type,
        size=req.size, download_url=req.downloadUrl, tool_id=req.toolId,
    )
    return asset


@router.get("/factory", response_model=FactoryAssetListResponse)
def listAssets(
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=500),
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """查询当前用户的工厂资产"""
    items, total = factory_service.listFactoryAssets(db, currentUser.id, page, pageSize)
    return FactoryAssetListResponse(total=total, page=page, pageSize=pageSize, items=items)


@router.delete("/factory/{assetId}")
def deleteAsset(
    assetId: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """删除工厂资产"""
    if not factory_service.deleteFactoryAsset(db, assetId, currentUser.id):
        raise HTTPException(status_code=404, detail="资产不存在或无权删除")
    return {"message": "删除成功"}


# --- 工厂历史 ---
@router.post("/history", response_model=FactoryHistoryResponse, status_code=201)
def createHistory(
    req: FactoryHistoryCreateRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """创建工厂使用历史"""
    history = factory_service.createFactoryHistory(
        db, userId=currentUser.id,
        tool_name=req.toolName, action=req.action, status=req.status,
        duration=req.duration, output=req.output,
    )
    return history


@router.get("/history", response_model=FactoryHistoryListResponse)
def listHistory(
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=500),
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """查询当前用户的工厂历史"""
    items, total = factory_service.listFactoryHistory(db, currentUser.id, page, pageSize)
    return FactoryHistoryListResponse(total=total, page=page, pageSize=pageSize, items=items)


# --- 数字员工历史 ---
@router.post("/worker", response_model=WorkerHistoryResponse, status_code=201)
def createWorkerHistory(
    req: WorkerHistoryCreateRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """创建数字员工任务历史"""
    history = factory_service.createWorkerHistory(
        db, userId=currentUser.id,
        command=req.command, status=req.status, duration=req.duration,
        result=req.result, log_file=req.logFile, device_label=req.deviceLabel,
    )
    return history


@router.get("/worker", response_model=WorkerHistoryListResponse)
def listWorkerHistory(
    page: int = Query(1, ge=1),
    pageSize: int = Query(50, ge=1, le=500),
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """查询当前用户的数字员工历史"""
    items, total = factory_service.listWorkerHistory(db, currentUser.id, page, pageSize)
    return WorkerHistoryListResponse(total=total, page=page, pageSize=pageSize, items=items)


@router.patch("/worker/latest-running", response_model=WorkerHistoryResponse)
def updateLatestRunningWorkerHistory(
    req: WorkerHistoryUpdateRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    更新当前用户最近一条 status='running' 的数字员工历史

    NOTE: 任务完成/取消/失败时由前端调用，避免 DB 中遗留 running 状态
    """
    updated = factory_service.updateLatestRunningWorkerHistory(
        db, userId=currentUser.id,
        status=req.status, duration=req.duration,
        result=req.result, logFile=req.logFile,
    )
    if updated is None:
        raise HTTPException(404, "No running worker history found")
    return updated


@router.delete("/history/{history_id}", status_code=204)
def deleteFactoryHistoryRecord(
    history_id: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """删除当前用户的一条工厂历史记录"""
    if not factory_service.deleteFactoryHistory(db, history_id, currentUser.id):
        raise HTTPException(404, "History record not found")


@router.delete("/worker/{history_id}", status_code=204)
def deleteWorkerHistoryRecord(
    history_id: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """删除当前用户的一条数字员工历史记录"""
    if not factory_service.deleteWorkerHistory(db, history_id, currentUser.id):
        raise HTTPException(404, "Worker history record not found")

