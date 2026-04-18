"""
JWT Token 管理模块

NOTE: 使用 python-jose 实现 JWT 签发和验证（提醒.md #16 第一层防护）
      Token 有效期默认 24 小时（1440 分钟），可通过 .env JWT_EXPIRE_MINUTES 配置
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "kunlun-jwt-secret-change-in-production-2026")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))


def createAccessToken(data: dict[str, Any], expiresDelta: timedelta | None = None) -> str:
    """
    签发 JWT Token

    @param data 负载数据，通常包含 {"sub": username, "role": role}
    @param expiresDelta 自定义过期时间，默认使用 .env 配置
    @returns JWT Token 字符串
    """
    toEncode = data.copy()
    expire = datetime.now(timezone.utc) + (expiresDelta or timedelta(minutes=EXPIRE_MINUTES))
    toEncode.update({"exp": expire})
    return jwt.encode(toEncode, SECRET_KEY, algorithm=ALGORITHM)


def decodeAccessToken(token: str) -> dict[str, Any] | None:
    """
    验证并解码 JWT Token

    @param token JWT Token 字符串
    @returns 解码后的负载数据，验证失败返回 None
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
