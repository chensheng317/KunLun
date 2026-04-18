"""
积分相关 Pydantic 模型
"""
from datetime import datetime
from pydantic import BaseModel, Field


class CreditRecordResponse(BaseModel):
    """积分变动记录响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    type: str
    amount: int
    balance: int
    description: str | None = None
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}


class CreditRecordListResponse(BaseModel):
    """积分记录分页响应"""
    total: int
    page: int
    pageSize: int
    items: list[CreditRecordResponse]


class CreditAdjustRequest(BaseModel):
    """管理员手动调整积分请求"""
    userId: int = Field(..., description="目标用户 ID")
    amount: int = Field(..., description="调整数量（正=增加，负=扣减）")
    description: str = Field("", description="调整原因")


class CreditConsumeRequest(BaseModel):
    """工具消费积分请求"""
    toolName: str = Field(..., description="工具名称")
    credits: int = Field(..., gt=0, description="消耗积分数")


class CreditScheduleResponse(BaseModel):
    """积分调度记录响应"""
    id: int
    userId: int = Field(..., validation_alias="user_id")
    role: str
    monthlyAmount: int = Field(..., validation_alias="monthly_amount")
    nextDistribution: datetime = Field(..., validation_alias="next_distribution")
    remainingMonths: int = Field(..., validation_alias="remaining_months")
    billingCycle: str = Field(..., validation_alias="billing_cycle")
    createdAt: datetime = Field(..., validation_alias="created_at")

    model_config = {"from_attributes": True, "populate_by_name": True}
