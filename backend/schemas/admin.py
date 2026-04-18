"""
管理后台相关 Pydantic 模型
"""
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


# --- 公告 ---
class AnnouncementCreateRequest(BaseModel):
    """创建公告请求"""
    title: str = Field(..., max_length=200)
    content: str
    type: str = Field("info", max_length=20)
    enabled: bool = True
    sortOrder: int = 0


class AnnouncementUpdateRequest(BaseModel):
    """更新公告请求"""
    title: str | None = None
    content: str | None = None
    type: str | None = None
    enabled: bool | None = None
    sortOrder: int | None = None


class AnnouncementResponse(BaseModel):
    """公告响应"""
    id: int
    title: str
    content: str
    type: str
    enabled: bool
    sortOrder: int = Field(..., validation_alias="sort_order")
    createdAt: datetime = Field(..., validation_alias="created_at")
    updatedAt: datetime = Field(..., validation_alias="updated_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


# --- 站点配置 ---
class SiteConfigResponse(BaseModel):
    """站点配置响应"""
    id: int
    configKey: str = Field(..., validation_alias="config_key")
    configValue: Any = Field(..., validation_alias="config_value")
    updatedAt: datetime = Field(..., validation_alias="updated_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class SiteConfigUpdateRequest(BaseModel):
    """更新站点配置"""
    configValue: Any


# --- 工具配置 ---
class ToolConfigResponse(BaseModel):
    """工具配置响应"""
    id: int
    toolId: str = Field(..., validation_alias="tool_id")
    name: str
    enabled: bool
    creditCost: int = Field(..., validation_alias="credit_cost")
    extraConfig: dict = Field(default_factory=dict, validation_alias="extra_config")
    description: str | None = None
    updatedAt: datetime = Field(..., validation_alias="updated_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class ToolConfigUpdateRequest(BaseModel):
    """更新工具配置"""
    name: str | None = None
    enabled: bool | None = None
    creditCost: int | None = None
    extraConfig: dict | None = None
    description: str | None = None


# --- 管理员操作日志 ---
class AdminLogResponse(BaseModel):
    """管理员操作日志响应"""
    id: int
    operator: str
    action: str
    target: str | None = None
    detail: str | None = None
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class AdminLogListResponse(BaseModel):
    total: int
    page: int
    pageSize: int
    items: list[AdminLogResponse]


# --- 工具使用日志 ---
class ToolUsageLogResponse(BaseModel):
    """工具使用日志响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    toolName: str = Field(..., validation_alias="tool_name")
    credits: int
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


# --- 数据概览聚合 ---
class DataOverviewResponse(BaseModel):
    """管理后台数据概览"""
    totalUsers: int
    totalCreditsConsumed: int
    totalToolCalls: int
    todayCreditsConsumed: int
    todayToolCalls: int
    todayNewUsers: int
    todayOrders: int
