"""
火山引擎 TOS 对象存储服务封装

NOTE: 复用 digital_human.py 中已验证的 TOS SDK 集成方案
      提供文件上传、预签名 URL 生成、文件删除等标准操作
      所有文件按 user-files/{user_id}/{lib_id}/ 路径组织
"""
import os
import logging
from typing import Optional

import tos

logger = logging.getLogger(__name__)

# 从环境变量读取 TOS 配置（与 digital_human.py 共享同一份 .env）
_ACCESS_KEY = os.getenv("VOLC_ACCESS_KEY", "")
_SECRET_KEY = os.getenv("VOLC_SECRET_KEY", "")
_ENDPOINT = os.getenv("TOS_ENDPOINT", "tos-cn-beijing.volces.com")
_REGION = os.getenv("TOS_REGION", "cn-beijing")
_BUCKET = os.getenv("TOS_BUCKET", "kunlun-digital-human")

# NOTE: 预签名 URL 有效期（秒），默认 1 小时
_PRESIGN_EXPIRES = 3600


def _getClient() -> tos.TosClientV2:
    """
    获取 TOS 客户端实例

    NOTE: 每次调用创建新实例，线程安全
    """
    if not _ACCESS_KEY or not _SECRET_KEY:
        raise RuntimeError("TOS credentials not configured in .env")
    return tos.TosClientV2(
        ak=_ACCESS_KEY,
        sk=_SECRET_KEY,
        endpoint=_ENDPOINT,
        region=_REGION,
    )


def buildObjectKey(userId: int, libId: int, fileName: str) -> str:
    """
    构建 TOS 对象 Key

    NOTE: 按 user-files/{user_id}/{lib_id}/{filename} 组织
          确保不同用户、不同库的文件路径完全隔离
    """
    # 去除文件名中的路径分隔符防止目录穿越
    safeName = fileName.replace("/", "_").replace("\\", "_")
    return f"user-files/{userId}/{libId}/{safeName}"


def uploadFile(
    objectKey: str,
    fileContent: bytes,
    contentType: str = "application/octet-stream",
) -> str:
    """
    上传文件到 TOS

    @param objectKey TOS 对象路径
    @param fileContent 文件二进制内容
    @param contentType MIME 类型
    @returns 上传后的对象 URL（不含签名，用于存储到数据库）
    """
    client = _getClient()
    try:
        client.put_object(
            bucket=_BUCKET,
            key=objectKey,
            content=fileContent,
            content_type=contentType,
        )
        # NOTE: 返回标准 TOS URL 格式（不含签名），数据库仅存路径
        url = f"https://{_BUCKET}.{_ENDPOINT}/{objectKey}"
        logger.info(f"TOS upload success: {objectKey}")
        return url
    except Exception as e:
        logger.error(f"TOS upload failed: {objectKey} — {e}")
        raise


def getPresignedUrl(objectKey: str, expires: int = _PRESIGN_EXPIRES) -> str:
    """
    生成预签名下载 URL

    NOTE: 前端通过此 URL 直接从 TOS 下载文件，避免后端中转流量
    """
    client = _getClient()
    try:
        result = client.pre_signed_url(
            http_method="GET",
            bucket=_BUCKET,
            key=objectKey,
            expires=expires,
        )
        return result.signed_url
    except Exception as e:
        logger.error(f"TOS presign failed: {objectKey} — {e}")
        raise


def deleteObject(objectKey: str) -> bool:
    """
    删除 TOS 上的文件

    NOTE: 删除素材库文件时同步清理 TOS 存储
    """
    client = _getClient()
    try:
        client.delete_object(bucket=_BUCKET, key=objectKey)
        logger.info(f"TOS delete success: {objectKey}")
        return True
    except Exception as e:
        logger.warning(f"TOS delete failed (non-critical): {objectKey} — {e}")
        return False


def extractObjectKey(storageUrl: str) -> Optional[str]:
    """
    从存储 URL 中提取对象 Key

    NOTE: URL 格式为 https://{bucket}.{endpoint}/{key}
          提取 key 用于删除操作
    """
    prefix = f"https://{_BUCKET}.{_ENDPOINT}/"
    if storageUrl and storageUrl.startswith(prefix):
        return storageUrl[len(prefix):]
    return None
