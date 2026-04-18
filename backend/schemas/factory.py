"""
工厂资产 / 历史记录 / 数字员工 Pydantic 模型
"""
from datetime import datetime
from pydantic import BaseModel, Field


# --- 工厂资产 ---
class FactoryAssetCreateRequest(BaseModel):
    """创建资产记录请求"""
    name: str = Field(..., max_length=255)
    source: str = Field(..., max_length=100)
    type: str = Field(..., max_length=20)
    size: str = Field("-", max_length=50)
    downloadUrl: str | None = Field(None, max_length=1000)
    toolId: str | None = Field(None, max_length=50)


class FactoryAssetResponse(BaseModel):
    """资产记录响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    name: str
    source: str
    type: str
    size: str
    downloadUrl: str | None = Field(None, validation_alias="download_url")
    toolId: str | None = Field(None, validation_alias="tool_id")
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class FactoryAssetListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[FactoryAssetResponse]


# --- 工厂历史 ---
class FactoryHistoryCreateRequest(BaseModel):
    """创建历史记录请求"""
    toolName: str = Field(..., max_length=100)
    action: str = Field(..., max_length=500)
    status: str = Field("success", max_length=20)
    duration: str | None = Field(None, max_length=50)
    output: str | None = None


class FactoryHistoryResponse(BaseModel):
    """历史记录响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    toolName: str = Field(..., validation_alias="tool_name")
    action: str
    status: str
    duration: str | None = None
    output: str | None = None
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class FactoryHistoryListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[FactoryHistoryResponse]


# --- 数字员工历史 ---
class WorkerHistoryCreateRequest(BaseModel):
    """创建数字员工历史记录"""
    command: str = Field(..., max_length=1000)
    status: str = Field("success", max_length=20)
    duration: str | None = Field(None, max_length=50)
    result: str | None = None
    logFile: str | None = Field(None, max_length=255)
    deviceLabel: str | None = Field(None, max_length=100)


class WorkerHistoryResponse(BaseModel):
    """数字员工历史响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    command: str
    status: str
    duration: str | None = None
    result: str | None = None
    logFile: str | None = Field(None, validation_alias="log_file")
    deviceLabel: str | None = Field(None, validation_alias="device_label")
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class WorkerHistoryListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[WorkerHistoryResponse]


class WorkerHistoryUpdateRequest(BaseModel):
    """更新数字员工历史状态请求（任务完成/取消/失败时调用）"""
    status: str = Field(..., max_length=20)
    duration: str | None = Field(None, max_length=50)
    result: str | None = None
    logFile: str | None = Field(None, max_length=255)
