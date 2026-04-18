"""
认证相关 Pydantic 模型

NOTE: 用于登录、注册、Token 响应的请求/响应数据校验
"""
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """登录请求"""
    username: str = Field(..., min_length=2, max_length=50, description="用户名")
    password: str = Field(..., min_length=4, max_length=128, description="密码")


class RegisterRequest(BaseModel):
    """注册请求"""
    username: str = Field(..., min_length=2, max_length=50, description="用户名")
    password: str = Field(..., min_length=6, max_length=128, description="密码（至少 6 位）")


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    oldPassword: str = Field(..., description="旧密码")
    newPassword: str = Field(..., min_length=6, max_length=128, description="新密码（至少 6 位）")


class ChangeUsernameRequest(BaseModel):
    """修改用户名请求"""
    newUsername: str = Field(..., min_length=2, max_length=50, description="新用户名")


class TokenResponse(BaseModel):
    """Token 响应"""
    accessToken: str = Field(..., description="JWT Token")
    tokenType: str = Field(default="bearer", description="Token 类型")
    username: str = Field(..., description="用户名")
    role: str = Field(..., description="用户角色")
    credits: int = Field(..., description="当前积分")
