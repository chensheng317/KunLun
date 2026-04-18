"""
自建素材库 Pydantic 请求/响应模型

NOTE: 文件上传走 multipart/form-data，元数据走 JSON
"""
from datetime import datetime
from pydantic import BaseModel, Field


# --- 素材库 ---
class LibraryCreateRequest(BaseModel):
    """创建素材库"""
    name: str = Field(..., max_length=100, description="素材库名称")


class LibraryResponse(BaseModel):
    """素材库响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    name: str
    fileCount: int = Field(0, description="库内文件数量")
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class LibraryListResponse(BaseModel):
    items: list[LibraryResponse]


# --- 素材库文件 ---
class LibFileResponse(BaseModel):
    """素材库文件响应"""
    id: int
    libraryId: int = Field(..., validation_alias="library_id")
    name: str
    size: str
    mimeType: str | None = Field(None, validation_alias="mime_type")
    storageUrl: str | None = Field(None, validation_alias="storage_url")
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class LibFileListResponse(BaseModel):
    items: list[LibFileResponse]
