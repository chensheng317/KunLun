"""
订单相关 Pydantic 模型
"""
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, computed_field


class OrderCreateRequest(BaseModel):
    """创建订单请求"""
    type: str = Field(..., description="订单类型：upgrade | recharge")
    amount: Decimal = Field(..., ge=0, description="支付金额")
    credits: int = Field(..., ge=0, description="获得积分")
    targetRole: str | None = Field(None, description="升级目标角色")
    planName: str | None = Field(None, description="方案名称")
    hasFirstBonus: bool = Field(False, description="是否包含首次加赠")
    firstBonusCredits: int = Field(0, description="首次加赠积分数")


class OrderResponse(BaseModel):
    """订单响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    username: str = Field("", description="订单所属用户名")
    type: str
    amount: Decimal
    credits: int
    targetRole: str | None = Field(None, validation_alias="target_role")
    planName: str | None = Field(None, validation_alias="plan_name")
    hasFirstBonus: bool = Field(..., validation_alias="has_first_bonus")
    firstBonusCredits: int = Field(..., validation_alias="first_bonus_credits")
    status: str
    createdAt: datetime = Field(..., validation_alias="created_at")
    updatedAt: datetime = Field(..., validation_alias="updated_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class OrderListResponse(BaseModel):
    """订单分页响应"""
    total: int
    page: int
    pageSize: int
    items: list[OrderResponse]


class OrderStatusUpdateRequest(BaseModel):
    """更新订单状态请求"""
    status: str = Field(..., description="新状态：completed | refunded | cancelled")
