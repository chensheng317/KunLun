"""
工厂资产 / 历史 / 数字员工业务逻辑

NOTE: 用户级数据隔离，所有查询自动附加 user_id 过滤
"""
import logging

from sqlalchemy.orm import Session

from models.factory import FactoryAsset, FactoryHistory
from models.worker import WorkerHistory

logger = logging.getLogger(__name__)


# --- 工厂资产 ---
def createFactoryAsset(db: Session, userId: int, **kwargs) -> FactoryAsset:
    """创建工厂资产记录"""
    asset = FactoryAsset(user_id=userId, **kwargs)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def listFactoryAssets(
    db: Session,
    userId: int,
    page: int = 1,
    pageSize: int = 50,
) -> tuple[list[FactoryAsset], int]:
    """分页查询用户的工厂资产"""
    query = db.query(FactoryAsset).filter(FactoryAsset.user_id == userId)
    total = query.count()
    items = (
        query
        .order_by(FactoryAsset.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


def deleteFactoryAsset(db: Session, assetId: int, userId: int) -> bool:
    """删除资产（用户级权限校验）"""
    asset = (
        db.query(FactoryAsset)
        .filter(FactoryAsset.id == assetId, FactoryAsset.user_id == userId)
        .first()
    )
    if asset is None:
        return False
    db.delete(asset)
    db.commit()
    return True


# --- 工厂历史 ---
def createFactoryHistory(db: Session, userId: int, **kwargs) -> FactoryHistory:
    """创建工厂使用历史"""
    history = FactoryHistory(user_id=userId, **kwargs)
    db.add(history)
    db.commit()
    db.refresh(history)
    return history


def listFactoryHistory(
    db: Session,
    userId: int,
    page: int = 1,
    pageSize: int = 50,
) -> tuple[list[FactoryHistory], int]:
    """分页查询用户的工厂历史"""
    query = db.query(FactoryHistory).filter(FactoryHistory.user_id == userId)
    total = query.count()
    items = (
        query
        .order_by(FactoryHistory.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


def deleteFactoryHistory(db: Session, historyId: int, userId: int) -> bool:
    """删除历史记录（用户级权限校验）"""
    record = (
        db.query(FactoryHistory)
        .filter(FactoryHistory.id == historyId, FactoryHistory.user_id == userId)
        .first()
    )
    if record is None:
        return False
    db.delete(record)
    db.commit()
    return True


# --- 数字员工历史 ---
def createWorkerHistory(db: Session, userId: int, **kwargs) -> WorkerHistory:
    """创建数字员工任务历史"""
    history = WorkerHistory(user_id=userId, **kwargs)
    db.add(history)
    db.commit()
    db.refresh(history)
    return history


def deleteWorkerHistory(db: Session, historyId: int, userId: int) -> bool:
    """删除数字员工历史记录（用户级权限校验）"""
    record = (
        db.query(WorkerHistory)
        .filter(WorkerHistory.id == historyId, WorkerHistory.user_id == userId)
        .first()
    )
    if record is None:
        return False
    db.delete(record)
    db.commit()
    return True


def listWorkerHistory(
    db: Session,
    userId: int,
    page: int = 1,
    pageSize: int = 50,
) -> tuple[list[WorkerHistory], int]:
    """分页查询用户的数字员工历史"""
    query = db.query(WorkerHistory).filter(WorkerHistory.user_id == userId)
    total = query.count()
    items = (
        query
        .order_by(WorkerHistory.created_at.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return items, total


def updateLatestRunningWorkerHistory(
    db: Session,
    userId: int,
    status: str,
    duration: str | None = None,
    result: str | None = None,
    logFile: str | None = None,
) -> WorkerHistory | None:
    """
    更新当前用户最近一条 status='running' 的数字员工历史记录

    NOTE: 任务完成/取消/失败时由前端调用，将 DB 中的 running 状态更新为最终状态。
          通过「最近一条 running 记录」匹配，无需前端记忆 DB 主键。
    """
    record = (
        db.query(WorkerHistory)
        .filter(WorkerHistory.user_id == userId, WorkerHistory.status == "running")
        .order_by(WorkerHistory.created_at.desc())
        .first()
    )
    if record is None:
        return None

    record.status = status
    if duration is not None:
        record.duration = duration
    if result is not None:
        record.result = result
    if logFile is not None:
        record.log_file = logFile
    db.commit()
    db.refresh(record)
    return record
