"""
自建素材库业务逻辑

NOTE: 用户级数据隔离 + TOS 文件存储
      素材库元数据存 PostgreSQL，文件本体存 TOS 对象存储
"""
import logging

from sqlalchemy.orm import Session

from models.library import CustomLibrary, CustomLibFile
from services import tos_service

logger = logging.getLogger(__name__)


# --- 素材库 CRUD ---

def createLibrary(db: Session, userId: int, name: str) -> CustomLibrary:
    """创建素材库"""
    lib = CustomLibrary(user_id=userId, name=name)
    db.add(lib)
    db.commit()
    db.refresh(lib)
    return lib


def listLibraries(db: Session, userId: int) -> list[CustomLibrary]:
    """获取用户的所有素材库（按创建时间倒序）"""
    return (
        db.query(CustomLibrary)
        .filter(CustomLibrary.user_id == userId)
        .order_by(CustomLibrary.created_at.desc())
        .all()
    )


def getLibrary(db: Session, libId: int, userId: int) -> CustomLibrary | None:
    """获取单个素材库（含权限校验）"""
    return (
        db.query(CustomLibrary)
        .filter(CustomLibrary.id == libId, CustomLibrary.user_id == userId)
        .first()
    )


def deleteLibrary(db: Session, libId: int, userId: int) -> bool:
    """
    删除素材库（含 TOS 文件清理）

    NOTE: ORM 级联删除会自动删除关联的 custom_lib_files 记录
          但需要手动清理 TOS 上的文件对象
    """
    lib = getLibrary(db, libId, userId)
    if lib is None:
        return False

    # 先清理 TOS 上的文件
    files = db.query(CustomLibFile).filter(CustomLibFile.library_id == libId).all()
    for f in files:
        if f.storage_url:
            objectKey = tos_service.extractObjectKey(f.storage_url)
            if objectKey:
                tos_service.deleteObject(objectKey)

    db.delete(lib)
    db.commit()
    return True


def getLibraryFileCount(db: Session, libId: int) -> int:
    """获取素材库中的文件数量"""
    return db.query(CustomLibFile).filter(CustomLibFile.library_id == libId).count()


# --- 素材库文件 CRUD ---

def listFiles(db: Session, libId: int) -> list[CustomLibFile]:
    """获取素材库中的所有文件"""
    return (
        db.query(CustomLibFile)
        .filter(CustomLibFile.library_id == libId)
        .order_by(CustomLibFile.created_at.desc())
        .all()
    )


def addFile(
    db: Session,
    libId: int,
    userId: int,
    fileName: str,
    fileContent: bytes,
    mimeType: str,
    fileSize: str,
) -> CustomLibFile:
    """
    上传文件到素材库

    NOTE: 先上传到 TOS，再写入数据库元数据
          确保 TOS 上传成功后才持久化记录
    """
    # 构建 TOS 对象路径并上传
    objectKey = tos_service.buildObjectKey(userId, libId, fileName)
    storageUrl = tos_service.uploadFile(objectKey, fileContent, mimeType)

    # 写入数据库
    libFile = CustomLibFile(
        library_id=libId,
        name=fileName,
        size=fileSize,
        mime_type=mimeType,
        storage_url=storageUrl,
    )
    db.add(libFile)
    db.commit()
    db.refresh(libFile)
    return libFile


def deleteFile(db: Session, fileId: int, libId: int) -> bool:
    """
    删除素材库文件

    NOTE: 同步删除 TOS 上的文件对象
    """
    libFile = (
        db.query(CustomLibFile)
        .filter(CustomLibFile.id == fileId, CustomLibFile.library_id == libId)
        .first()
    )
    if libFile is None:
        return False

    # 清理 TOS
    if libFile.storage_url:
        objectKey = tos_service.extractObjectKey(libFile.storage_url)
        if objectKey:
            tos_service.deleteObject(objectKey)

    db.delete(libFile)
    db.commit()
    return True


def getFileDownloadUrl(db: Session, fileId: int, libId: int) -> str | None:
    """
    获取文件的预签名下载 URL

    NOTE: 前端通过此 URL 直接从 TOS 下载，避免后端中转
    """
    libFile = (
        db.query(CustomLibFile)
        .filter(CustomLibFile.id == fileId, CustomLibFile.library_id == libId)
        .first()
    )
    if libFile is None or not libFile.storage_url:
        return None

    objectKey = tos_service.extractObjectKey(libFile.storage_url)
    if objectKey is None:
        return None

    return tos_service.getPresignedUrl(objectKey)
