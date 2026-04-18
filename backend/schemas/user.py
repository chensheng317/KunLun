"""
用户相关 Pydantic 模型

NOTE: password_hash 永不出现在响应模型中（提醒.md #16）
"""
from datetime import datetime
from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    """用户公开信息响应（排除 password_hash）"""
    id: int
    username: str
    role: str
    credits: int
    # NOTE: 使用 validation_alias 从 ORM snake_case 属性读取，
    #       输出 JSON 时自动用字段名 camelCase
    membershipExpiry: datetime | None = Field(None, validation_alias="membership_expiry")
    disabled: bool
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class UserDetailResponse(UserResponse):
    """用户详细信息（管理后台使用）"""
    firstBonusClaimed: list = Field(default_factory=list, validation_alias="first_bonus_claimed")
    lastHeartbeat: datetime | None = Field(None, validation_alias="last_heartbeat")
    updatedAt: datetime = Field(..., validation_alias="updated_at")


class UserUpdateRequest(BaseModel):
    """管理员更新用户请求"""
    role: str | None = None
    credits: int | None = None
    disabled: bool | None = None


class UserListResponse(BaseModel):
    """用户列表分页响应"""
    total: int
    page: int
    pageSize: int
    items: list[UserDetailResponse]
