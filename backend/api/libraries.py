"""
自建素材库 REST API 路由

NOTE: 用户级数据隔离，所有操作自动绑定当前用户
      文件上传通过 multipart/form-data，文件本体存 TOS 对象存储
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.orm import Session

from database.connection import get_db
from auth.dependencies import getCurrentUser
from models.user import User
from schemas.library import (
    LibraryCreateRequest, LibraryResponse, LibraryListResponse,
    LibFileResponse, LibFileListResponse,
)
from services import library_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/libraries", tags=["自建素材库"])


def _formatFileSize(sizeBytes: int) -> str:
    """格式化文件大小为人类可读字符串"""
    if sizeBytes < 1024:
        return f"{sizeBytes} B"
    if sizeBytes < 1024 * 1024:
        return f"{sizeBytes / 1024:.1f} KB"
    if sizeBytes < 1024 * 1024 * 1024:
        return f"{sizeBytes / (1024 * 1024):.1f} MB"
    return f"{sizeBytes / (1024 * 1024 * 1024):.1f} GB"


# --- 素材库管理 ---

@router.post("", response_model=LibraryResponse, status_code=201)
def createLibrary(
    req: LibraryCreateRequest,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """创建新素材库"""
    lib = library_service.createLibrary(db, userId=currentUser.id, name=req.name)
    return LibraryResponse(
        id=lib.id,
        user_id=lib.user_id,
        name=lib.name,
        fileCount=0,
        created_at=lib.created_at,
    )


@router.get("", response_model=LibraryListResponse)
def listLibraries(
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """获取当前用户的所有素材库"""
    libs = library_service.listLibraries(db, currentUser.id)
    items = []
    for lib in libs:
        count = library_service.getLibraryFileCount(db, lib.id)
        items.append(LibraryResponse(
            id=lib.id,
            user_id=lib.user_id,
            name=lib.name,
            fileCount=count,
            created_at=lib.created_at,
        ))
    return LibraryListResponse(items=items)


@router.delete("/{libId}")
def deleteLibrary(
    libId: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """删除素材库（含 TOS 文件清理）"""
    if not library_service.deleteLibrary(db, libId, currentUser.id):
        raise HTTPException(status_code=404, detail="素材库不存在或无权删除")
    return {"message": "删除成功"}


# --- 素材库文件管理 ---

@router.get("/{libId}/files", response_model=LibFileListResponse)
def listFiles(
    libId: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """获取素材库中的所有文件"""
    # 先校验素材库归属权
    lib = library_service.getLibrary(db, libId, currentUser.id)
    if lib is None:
        raise HTTPException(status_code=404, detail="素材库不存在或无权访问")
    files = library_service.listFiles(db, libId)
    return LibFileListResponse(items=files)


@router.post("/{libId}/files", response_model=LibFileResponse, status_code=201)
async def uploadFile(
    libId: int,
    file: UploadFile = FastAPIFile(...),
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    上传文件到素材库

    NOTE: 文件通过 multipart/form-data 上传
          后端接收后上传到 TOS 对象存储，数据库仅存元数据
    """
    # 校验素材库归属权
    lib = library_service.getLibrary(db, libId, currentUser.id)
    if lib is None:
        raise HTTPException(status_code=404, detail="素材库不存在或无权访问")

    # 读取文件内容
    content = await file.read()
    fileName = file.filename or "unnamed_file"
    mimeType = file.content_type or "application/octet-stream"
    fileSize = _formatFileSize(len(content))

    try:
        libFile = library_service.addFile(
            db,
            libId=libId,
            userId=currentUser.id,
            fileName=fileName,
            fileContent=content,
            mimeType=mimeType,
            fileSize=fileSize,
        )
        return libFile
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"文件上传失败: {e}")


@router.delete("/{libId}/files/{fileId}")
def deleteFile(
    libId: int,
    fileId: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """删除素材库中的文件"""
    # 校验素材库归属权
    lib = library_service.getLibrary(db, libId, currentUser.id)
    if lib is None:
        raise HTTPException(status_code=404, detail="素材库不存在或无权访问")

    if not library_service.deleteFile(db, fileId, libId):
        raise HTTPException(status_code=404, detail="文件不存在")
    return {"message": "删除成功"}


@router.get("/{libId}/files/{fileId}/download")
def getFileDownloadUrl(
    libId: int,
    fileId: int,
    currentUser: User = Depends(getCurrentUser),
    db: Session = Depends(get_db),
):
    """
    获取文件的预签名下载 URL

    NOTE: 返回 TOS 预签名 URL，前端直接跳转下载，避免后端中转大文件
    """
    # 校验素材库归属权
    lib = library_service.getLibrary(db, libId, currentUser.id)
    if lib is None:
        raise HTTPException(status_code=404, detail="素材库不存在或无权访问")

    url = library_service.getFileDownloadUrl(db, fileId, libId)
    if url is None:
        raise HTTPException(status_code=404, detail="文件不存在或无下载链接")
    return {"downloadUrl": url}
