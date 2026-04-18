"""
数字人快速模式服务
NOTE: 接入即梦（火山引擎）数字人快速模式 API
- 步骤1: 主体识别 — 检测图片中是否包含人/类人/拟人主体
- 步骤2: 视频生成 — 图片 + 音频 → 数字人视频

API 采用异步任务模式：提交任务(CVSubmitTask) → 轮询结果(CVGetResult)
鉴权通过 volcengine SDK 的 VisualService 自动处理签名
"""

import os
import uuid
import json
import time
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/digital-human", tags=["数字人快速模式"])

# ──────────────────────────────────────────────
# 火山引擎即梦 API 配置
# ──────────────────────────────────────────────
VOLC_ACCESS_KEY = os.getenv("VOLC_ACCESS_KEY", "")
VOLC_SECRET_KEY = os.getenv("VOLC_SECRET_KEY", "")

# TOS 对象存储配置
# NOTE: 即梦 API 要求 image_url / audio_url 为公网可访问的 URL
# 本地 127.0.0.1 地址即梦服务器无法访问，必须通过 TOS 中转
TOS_BUCKET = os.getenv("TOS_BUCKET", "")
TOS_ENDPOINT = os.getenv("TOS_ENDPOINT", "tos-cn-beijing.volces.com")
TOS_REGION = os.getenv("TOS_REGION", "cn-beijing")

# 即梦 req_key 常量
REQ_KEY_DETECT = "jimeng_realman_avatar_picture_create_role_omni"
REQ_KEY_VIDEO = "jimeng_realman_avatar_picture_omni_v2"

# 文件存储目录
BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "digital-human")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs", "digital-human")
HISTORY_FILE = os.path.join(OUTPUT_DIR, "generation_history.json")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 内存任务状态缓存
TASKS: dict[str, dict] = {}

# TOS 文件 ID → 公网预签名 URL 缓存 (避免重复生成)
TOS_URL_CACHE: dict[str, tuple[str, float]] = {}

# ──────────────────────────────────────────────
# 即梦 API 业务错误码 → 中文提示映射
# NOTE: 方便前端直接展示，也便于开发者快速定位问题
# ──────────────────────────────────────────────
ERROR_CODE_MAP: dict[int, dict] = {
    10000: {"message": "请求成功", "retryable": False},
    50218: {"message": "图片内容安全审核未通过（Resource exists risk），请更换其他人物图片", "retryable": False},
    50411: {"message": "输入图片审核未通过（可能包含不合规内容）", "retryable": False},
    50511: {"message": "输出图片后审核未通过", "retryable": True},
    50412: {"message": "输入文本审核未通过", "retryable": False},
    50512: {"message": "输出文本后审核未通过", "retryable": False},
    50413: {"message": "输入文本含敏感词或版权词，审核不通过", "retryable": False},
    50516: {"message": "输出视频后审核未通过", "retryable": True},
    50517: {"message": "输出音频后审核未通过", "retryable": True},
    50518: {"message": "输入版权图片审核未通过", "retryable": False},
    50519: {"message": "输出版权图片后审核未通过", "retryable": True},
    50520: {"message": "审核服务异常，请稍后重试", "retryable": False},
    50521: {"message": "版权词服务异常，请稍后重试", "retryable": False},
    50522: {"message": "版权图服务异常，请稍后重试", "retryable": False},
    50429: {"message": "请求频率超限（QPS），请稍后重试", "retryable": True},
    50430: {"message": "并发超限（免费试用并发=1），请等待上一个任务完成", "retryable": True},
    50500: {"message": "即梦服务内部错误，请稍后重试", "retryable": True},
    50501: {"message": "即梦算法内部错误，请稍后重试", "retryable": True},
}

# 任务状态中文映射
TASK_STATUS_MAP: dict[str, str] = {
    "in_queue": "排队中",
    "generating": "生成中",
    "done": "已完成",
    "not_found": "任务未找到（可能已过期）",
    "expired": "任务已过期（超过12小时）",
}


def _getVisualService():
    """
    获取火山引擎 VisualService 实例
    NOTE: 每次调用时创建新实例以确保使用最新的环境变量配置
    """
    try:
        from volcengine.visual.VisualService import VisualService
    except ImportError as e:
        logger.error(
            f"Failed to import volcengine SDK: {e}. "
            f"Please run: pip install volcengine"
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error": "SDK_NOT_INSTALLED",
                "message": "volcengine SDK 未安装，请执行 pip install volcengine",
                "retryable": False,
            },
        )

    if not VOLC_ACCESS_KEY or not VOLC_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "MISSING_CREDENTIALS",
                "message": "未配置火山引擎 AccessKey，请在 .env 中设置 VOLC_ACCESS_KEY 和 VOLC_SECRET_KEY",
                "retryable": False,
            },
        )

    service = VisualService()
    service.set_ak(VOLC_ACCESS_KEY)
    service.set_sk(VOLC_SECRET_KEY)
    return service


def _getTosClient():
    """
    获取 TOS 客户端实例
    NOTE: 用于上传文件到火山引擎对象存储，获取公网可访问的 URL
    即梦 API 要求 image_url/audio_url 必须公网可访问
    """
    if not TOS_BUCKET:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "TOS_NOT_CONFIGURED",
                "message": "TOS 对象存储未配置。请在 .env 中设置 TOS_BUCKET、TOS_ENDPOINT、TOS_REGION。"
                           "即梦 API 要求图片/音频 URL 公网可访问，本地地址无法使用。",
                "retryable": False,
            },
        )

    try:
        import tos as tos_sdk
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "TOS_SDK_NOT_INSTALLED",
                "message": "TOS SDK 未安装，请执行 pip install tos",
                "retryable": False,
            },
        )

    return tos_sdk.TosClientV2(
        ak=VOLC_ACCESS_KEY,
        sk=VOLC_SECRET_KEY,
        endpoint=TOS_ENDPOINT,
        region=TOS_REGION,
    )


def _uploadToTos(localPath: str, objectKey: str) -> str:
    """
    上传本地文件到 TOS 并返回预签名的公网访问 URL（有效期1小时）
    NOTE: 即梦 API 需要公网可访问的 URL，不能用 127.0.0.1
    使用预签名 URL 避免将 bucket 设为公开读
    """
    import tos as tos_sdk

    # 检查缓存（1小时有效期内直接复用）
    cached = TOS_URL_CACHE.get(objectKey)
    if cached:
        url, expireAt = cached
        # 预留5分钟缓冲
        if time.time() < expireAt - 300:
            logger.info(f"TOS URL cache hit: {objectKey}")
            return url

    client = _getTosClient()

    # 上传文件到 TOS
    client.put_object_from_file(
        TOS_BUCKET,
        objectKey,
        localPath,
    )
    logger.info(f"File uploaded to TOS: {objectKey}")

    # 生成预签名 URL（有效期3600秒=1小时）
    result = client.pre_signed_url(
        http_method=tos_sdk.HttpMethodType.Http_Method_Get,
        bucket=TOS_BUCKET,
        key=objectKey,
        expires=3600,
    )
    signedUrl = result.signed_url
    TOS_URL_CACHE[objectKey] = (signedUrl, time.time() + 3600)
    logger.info(f"TOS pre-signed URL generated: {objectKey} -> {signedUrl[:80]}...")

    return signedUrl


def _translateErrorCode(code: int, message: str, requestId: str) -> dict:
    """
    将即梦 API 错误码翻译为结构化的中文错误信息
    NOTE: 包含 request_id 以便快速定位问题（可直接提供给火山引擎工单排查）
    """
    mapped = ERROR_CODE_MAP.get(code, {
        "message": f"未知错误 (code={code}): {message}",
        "retryable": False,
    })
    return {
        "error": f"JIMENG_API_ERROR_{code}",
        "code": code,
        "message": mapped["message"],
        "retryable": mapped["retryable"],
        "detail": message,
        "requestId": requestId,
    }


def _parseExceptionAsApiError(errMsg: str, fallbackError: str, fallbackMessage: str) -> dict:
    """
    从 SDK 异常信息中提取 JSON 错误码并翻译
    NOTE: volcengine SDK 抛出异常时，异常消息中可能包含完整的 API JSON 响应
    例如: b'{"code":50218,"data":null,"message":"Resource exists risk.","request_id":"..."}'
    尝试解析该 JSON 以提取错误码进行智能翻译，而非直接展示原始 bytes
    """
    try:
        # 尝试从异常字符串中提取 JSON（SDK 通常以 b'...' 形式包裹响应体）
        jsonStr = errMsg
        if "b'" in jsonStr:
            start = jsonStr.index("b'") + 2
            end = jsonStr.rindex("'")
            jsonStr = jsonStr[start:end]
        elif 'b"' in jsonStr:
            start = jsonStr.index('b"') + 2
            end = jsonStr.rindex('"')
            jsonStr = jsonStr[start:end]

        parsed = json.loads(jsonStr)
        code = parsed.get("code", 0)
        message = parsed.get("message", "")
        requestId = parsed.get("request_id", "")

        if code and code != 10000:
            return _translateErrorCode(code, message, requestId)
    except (ValueError, json.JSONDecodeError, KeyError):
        pass

    # 解析失败则返回原始错误信息
    return {
        "error": fallbackError,
        "message": f"{fallbackMessage}: {errMsg}",
        "retryable": True,
    }


def _translateTaskStatus(status: str) -> str:
    """将即梦任务状态翻译为中文"""
    return TASK_STATUS_MAP.get(status, status)


def _loadHistory() -> list[dict]:
    """加载生成历史记录"""
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def _saveHistory(history: list[dict]) -> None:
    """持久化生成历史记录（保留最近50条）"""
    history = history[-50:]
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


# ──────────────────────────────────────────────
# 数据模型
# ──────────────────────────────────────────────
class UploadResponse(BaseModel):
    """文件上传响应"""
    imageId: str = Field(default="", description="图片文件ID")
    audioId: str = Field(default="", description="音频文件ID")
    imagePath: str = Field(default="", description="图片本地路径")
    audioPath: str = Field(default="", description="音频本地路径")


class DetectResponse(BaseModel):
    """主体识别响应"""
    taskId: str = Field(..., description="内部任务ID")
    jimengTaskId: str = Field(default="", description="即梦任务ID")
    status: str = Field(default="submitted", description="任务状态")
    statusText: str = Field(default="已提交", description="状态中文描述")


class GenerateResponse(BaseModel):
    """视频生成响应"""
    taskId: str = Field(..., description="内部任务ID")
    jimengTaskId: str = Field(default="", description="即梦任务ID")
    status: str = Field(default="submitted", description="任务状态")
    statusText: str = Field(default="已提交", description="状态中文描述")


class TaskStatusResponse(BaseModel):
    """任务状态查询响应"""
    taskId: str
    type: str = Field(description="任务类型: detect / generate")
    status: str
    statusText: str
    result: Optional[dict] = Field(default=None, description="任务结果数据")
    error: Optional[dict] = Field(default=None, description="错误信息")


# ──────────────────────────────────────────────
# API 端点
# ──────────────────────────────────────────────

@router.post("/upload")
async def uploadFiles(
    image: Optional[UploadFile] = File(None, description="人物图片 (JPG/PNG/JFIF, <5MB)"),
    audio: Optional[UploadFile] = File(None, description="驱动音频 (MP3/WAV/M4A, 建议<15秒)"),
):
    """
    上传图片和/或音频文件
    NOTE: 文件保存到本地，返回文件ID用于后续的主体识别和视频生成
    图片要求：JPG/PNG/JFIF，<5MB，<4096x4096，单人正面效果最佳
    音频要求：建议<15秒，过长可能导致效果劣化
    """
    result = UploadResponse()

    if image:
        # 校验图片格式
        ext = os.path.splitext(image.filename or "photo.jpg")[1].lower()
        allowedImageExts = {".jpg", ".jpeg", ".png", ".jfif"}
        if ext not in allowedImageExts:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_IMAGE_FORMAT",
                    "message": f"图片格式不支持: {ext}，请使用 JPG/PNG/JFIF 格式",
                    "retryable": False,
                },
            )

        imageContent = await image.read()

        # 校验图片大小 (5MB)
        if len(imageContent) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "IMAGE_TOO_LARGE",
                    "message": f"图片文件过大 ({len(imageContent) / 1024 / 1024:.1f}MB)，请压缩至 5MB 以下",
                    "retryable": False,
                },
            )

        imageId = str(uuid.uuid4())
        imagePath = os.path.join(UPLOAD_DIR, f"{imageId}{ext}")
        with open(imagePath, "wb") as f:
            f.write(imageContent)

        result.imageId = imageId
        result.imagePath = imagePath
        logger.info(f"Image uploaded: {imageId}{ext} ({len(imageContent)} bytes)")

    if audio:
        ext = os.path.splitext(audio.filename or "audio.mp3")[1].lower()
        allowedAudioExts = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
        if ext not in allowedAudioExts:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_AUDIO_FORMAT",
                    "message": f"音频格式不支持: {ext}，请使用 MP3/WAV/M4A 格式",
                    "retryable": False,
                },
            )

        audioContent = await audio.read()
        audioId = str(uuid.uuid4())
        audioPath = os.path.join(UPLOAD_DIR, f"{audioId}{ext}")
        with open(audioPath, "wb") as f:
            f.write(audioContent)

        result.audioId = audioId
        result.audioPath = audioPath
        logger.info(f"Audio uploaded: {audioId}{ext} ({len(audioContent)} bytes)")

    if not image and not audio:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "NO_FILE_UPLOADED",
                "message": "请至少上传一个图片或音频文件",
                "retryable": False,
            },
        )

    return result


@router.post("/detect")
async def detectSubject(
    imageUrl: str = Form(default="", description="公网可访问的图片URL"),
    imageId: str = Form(default="", description="通过 /upload 接口获取的图片ID"),
):
    """
    步骤1：主体识别
    NOTE: 检测图片中是否包含人/类人/拟人主体
    即梦 API 要求 image_url 为公网可访问的URL
    如果提供 imageId，会尝试通过本地服务器提供的URL访问
    """
    # 确定图片URL
    # NOTE: 即梦 API 要求公网可访问的 URL，通过 TOS 对象存储中转
    actualImageUrl = imageUrl

    if not actualImageUrl and imageId:
        # 查找本地文件并上传到 TOS 获取公网 URL
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(imageId):
                localPath = os.path.join(UPLOAD_DIR, f)
                tosKey = f"digital-human/images/{f}"
                try:
                    actualImageUrl = _uploadToTos(localPath, tosKey)
                    logger.info(f"Image uploaded to TOS for detect: {tosKey}")
                except Exception as e:
                    logger.error(f"TOS upload failed for detect: {e}")
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "error": "TOS_UPLOAD_FAILED",
                            "message": f"图片上传到对象存储失败: {e}",
                            "retryable": True,
                        },
                    )
                break

    if not actualImageUrl:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "MISSING_IMAGE_URL",
                "message": "请提供图片URL（imageUrl）或已上传的图片ID（imageId）",
                "retryable": False,
            },
        )

    taskId = str(uuid.uuid4())
    service = _getVisualService()

    # 提交主体识别任务
    submitForm = {
        "req_key": REQ_KEY_DETECT,
        "image_url": actualImageUrl,
    }

    try:
        resp = service.cv_submit_task(submitForm)
        logger.info(f"Detect submit response: {json.dumps(resp, ensure_ascii=False, default=str)[:500]}")
    except Exception as e:
        errMsg = str(e)
        logger.error(f"Detect submit failed: {errMsg}")
        # NOTE: 尝试从异常信息中解析即梦 API 错误码（如 50218 内容安全审核）
        errorInfo = _parseExceptionAsApiError(
            errMsg, "DETECT_SUBMIT_FAILED", "主体识别请求提交失败"
        )
        raise HTTPException(status_code=400, detail=errorInfo)

    # 解析响应
    code = resp.get("code", 0)
    if code != 10000:
        errorInfo = _translateErrorCode(
            code,
            resp.get("message", ""),
            resp.get("request_id", ""),
        )
        logger.warning(f"Detect submit error: {errorInfo}")
        raise HTTPException(status_code=400, detail=errorInfo)

    jimengTaskId = resp.get("data", {}).get("task_id", "")

    # 保存任务状态
    TASKS[taskId] = {
        "type": "detect",
        "jimengTaskId": jimengTaskId,
        "status": "submitted",
        "statusText": "已提交",
        "imageUrl": actualImageUrl,
        "result": None,
        "error": None,
        "createdAt": time.time(),
    }

    return DetectResponse(
        taskId=taskId,
        jimengTaskId=jimengTaskId,
        status="submitted",
        statusText="已提交",
    )


@router.post("/generate")
async def generateVideo(
    imageUrl: str = Form(default="", description="公网可访问的图片URL"),
    audioUrl: str = Form(default="", description="公网可访问的音频URL"),
    imageId: str = Form(default="", description="通过 /upload 接口获取的图片ID"),
    audioId: str = Form(default="", description="通过 /upload 接口获取的音频ID"),
):
    """
    步骤2：视频生成
    NOTE: 使用图片 + 音频生成数字人视频
    即梦 API 要求 image_url 和 audio_url 为公网可访问的URL
    如果提供 imageId/audioId，会尝试用本地URL
    """
    # 确定图片URL（通过 TOS 中转获取公网访问地址）
    actualImageUrl = imageUrl
    if not actualImageUrl and imageId:
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(imageId):
                localPath = os.path.join(UPLOAD_DIR, f)
                tosKey = f"digital-human/images/{f}"
                try:
                    actualImageUrl = _uploadToTos(localPath, tosKey)
                except Exception as e:
                    logger.error(f"TOS upload failed for image: {e}")
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "error": "TOS_UPLOAD_FAILED",
                            "message": f"图片上传到对象存储失败: {e}",
                            "retryable": True,
                        },
                    )
                break

    # 确定音频URL（通过 TOS 中转获取公网访问地址）
    actualAudioUrl = audioUrl
    if not actualAudioUrl and audioId:
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(audioId):
                localPath = os.path.join(UPLOAD_DIR, f)
                tosKey = f"digital-human/audio/{f}"
                try:
                    actualAudioUrl = _uploadToTos(localPath, tosKey)
                except Exception as e:
                    logger.error(f"TOS upload failed for audio: {e}")
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "error": "TOS_UPLOAD_FAILED",
                            "message": f"音频上传到对象存储失败: {e}",
                            "retryable": True,
                        },
                    )
                break

    if not actualImageUrl:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "MISSING_IMAGE",
                "message": "请提供图片URL或已上传的图片ID",
                "retryable": False,
            },
        )

    if not actualAudioUrl:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "MISSING_AUDIO",
                "message": "请提供音频URL或已上传的音频ID",
                "retryable": False,
            },
        )

    taskId = str(uuid.uuid4())
    service = _getVisualService()

    # 提交视频生成任务
    submitForm = {
        "req_key": REQ_KEY_VIDEO,
        "image_url": actualImageUrl,
        "audio_url": actualAudioUrl,
    }

    try:
        resp = service.cv_submit_task(submitForm)
        logger.info(f"Generate submit response: {json.dumps(resp, ensure_ascii=False, default=str)[:500]}")
    except Exception as e:
        errMsg = str(e)
        logger.error(f"Generate submit failed: {errMsg}")
        # NOTE: 尝试从异常信息中解析即梦 API 错误码
        errorInfo = _parseExceptionAsApiError(
            errMsg, "GENERATE_SUBMIT_FAILED", "视频生成请求提交失败"
        )
        raise HTTPException(status_code=400, detail=errorInfo)

    # 解析响应
    code = resp.get("code", 0)
    if code != 10000:
        errorInfo = _translateErrorCode(
            code,
            resp.get("message", ""),
            resp.get("request_id", ""),
        )
        logger.warning(f"Generate submit error: {errorInfo}")
        raise HTTPException(status_code=400, detail=errorInfo)

    jimengTaskId = resp.get("data", {}).get("task_id", "")

    # 保存任务状态
    TASKS[taskId] = {
        "type": "generate",
        "jimengTaskId": jimengTaskId,
        "status": "submitted",
        "statusText": "已提交",
        "imageUrl": actualImageUrl,
        "audioUrl": actualAudioUrl,
        "result": None,
        "error": None,
        "createdAt": time.time(),
    }

    return GenerateResponse(
        taskId=taskId,
        jimengTaskId=jimengTaskId,
        status="submitted",
        statusText="已提交",
    )


@router.get("/task/{taskId}")
async def getTaskStatus(taskId: str):
    """
    查询任务状态（主体识别 或 视频生成）
    NOTE: 前端轮询此接口获取异步任务进度
    任务状态流转: submitted → in_queue → generating → done
    """
    task = TASKS.get(taskId)
    if not task:
        return TaskStatusResponse(
            taskId=taskId,
            type="unknown",
            status="not_found",
            statusText="任务不存在（可能已重启服务）",
        )

    # 如果任务已终态，直接返回缓存结果
    if task["status"] in ("completed", "failed"):
        return TaskStatusResponse(
            taskId=taskId,
            type=task["type"],
            status=task["status"],
            statusText=task["statusText"],
            result=task.get("result"),
            error=task.get("error"),
        )

    # 向即梦 API 查询最新状态
    jimengTaskId = task.get("jimengTaskId", "")
    if not jimengTaskId:
        task["status"] = "failed"
        task["statusText"] = "无效的即梦任务ID"
        return TaskStatusResponse(
            taskId=taskId,
            type=task["type"],
            status="failed",
            statusText=task["statusText"],
        )

    service = _getVisualService()

    queryForm = {
        "req_key": REQ_KEY_DETECT if task["type"] == "detect" else REQ_KEY_VIDEO,
        "task_id": jimengTaskId,
    }

    try:
        resp = service.cv_get_result(queryForm)
        logger.info(f"Task query response [{taskId}]: {json.dumps(resp, ensure_ascii=False, default=str)[:500]}")
    except Exception as e:
        errMsg = str(e)
        logger.error(f"Task query failed [{taskId}]: {errMsg}")
        return TaskStatusResponse(
            taskId=taskId,
            type=task["type"],
            status="querying_error",
            statusText=f"查询失败: {errMsg}",
            error={
                "error": "QUERY_FAILED",
                "message": f"任务状态查询失败: {errMsg}",
                "retryable": True,
                "debugInfo": errMsg,
            },
        )

    code = resp.get("code", 0)

    # 如果 code != 10000，API 返回了错误
    if code != 10000:
        errorInfo = _translateErrorCode(
            code,
            resp.get("message", ""),
            resp.get("request_id", ""),
        )
        task["status"] = "failed"
        task["statusText"] = errorInfo["message"]
        task["error"] = errorInfo
        return TaskStatusResponse(
            taskId=taskId,
            type=task["type"],
            status="failed",
            statusText=errorInfo["message"],
            error=errorInfo,
        )

    data = resp.get("data", {})
    jimengStatus = data.get("status", "")

    # 更新任务状态
    task["statusText"] = _translateTaskStatus(jimengStatus)

    if jimengStatus == "done":
        if task["type"] == "detect":
            # 解析主体识别结果
            respDataStr = data.get("resp_data", "{}")
            try:
                respData = json.loads(respDataStr) if isinstance(respDataStr, str) else respDataStr
            except json.JSONDecodeError:
                respData = {"status": -1}

            detectStatus = respData.get("status", -1)
            hasSubject = detectStatus == 1

            task["status"] = "completed"
            task["statusText"] = "主体识别完成"
            task["result"] = {
                "hasSubject": hasSubject,
                "detectStatus": detectStatus,
                "description": "图片中包含人物主体" if hasSubject else "图片中未检测到人物主体",
            }

        elif task["type"] == "generate":
            # 解析视频生成结果
            videoUrl = data.get("video_url", "")
            if videoUrl:
                # 尝试下载视频到本地
                localVideoUrl = videoUrl
                try:
                    async with httpx.AsyncClient(timeout=60) as client:
                        vidResp = await client.get(videoUrl, follow_redirects=True)
                        if vidResp.status_code == 200:
                            fileName = f"{taskId}.mp4"
                            filePath = os.path.join(OUTPUT_DIR, fileName)
                            with open(filePath, "wb") as f:
                                f.write(vidResp.content)
                            localVideoUrl = f"/api/digital-human/output/{fileName}"
                            logger.info(f"Video downloaded: {fileName} ({len(vidResp.content)} bytes)")
                except Exception as e:
                    logger.warning(f"Video download failed, using remote URL: {e}")

                task["status"] = "completed"
                task["statusText"] = "视频生成完成"
                task["result"] = {
                    "videoUrl": localVideoUrl,
                    "remoteVideoUrl": videoUrl,
                }

                # 保存到历史记录
                history = _loadHistory()
                history.append({
                    "taskId": taskId,
                    "videoUrl": localVideoUrl,
                    "imageUrl": task.get("imageUrl", ""),
                    "createdAt": time.time(),
                })
                _saveHistory(history)
            else:
                task["status"] = "failed"
                task["statusText"] = "视频生成完成但未返回视频地址"

    elif jimengStatus in ("in_queue", "generating"):
        task["status"] = jimengStatus
    elif jimengStatus in ("not_found", "expired"):
        task["status"] = "failed"
        task["statusText"] = _translateTaskStatus(jimengStatus)
    else:
        task["status"] = jimengStatus

    return TaskStatusResponse(
        taskId=taskId,
        type=task["type"],
        status=task["status"],
        statusText=task["statusText"],
        result=task.get("result"),
        error=task.get("error"),
    )


@router.get("/history")
async def getHistory():
    """获取生成历史记录（最近50条）"""
    return {"history": _loadHistory()}


@router.delete("/history")
async def clearHistory():
    """清空生成历史记录"""
    _saveHistory([])
    return {"success": True}


@router.get("/output/{fileName}")
async def getOutputFile(fileName: str):
    """获取生成的视频文件"""
    filePath = os.path.join(OUTPUT_DIR, fileName)
    if not os.path.exists(filePath):
        raise HTTPException(
            status_code=404,
            detail={
                "error": "FILE_NOT_FOUND",
                "message": f"文件不存在: {fileName}",
                "retryable": False,
            },
        )
    return FileResponse(filePath, media_type="video/mp4")


@router.get("/file/{fileName}")
async def getUploadedFile(fileName: str):
    """
    获取上传的源文件（图片/音频）
    NOTE: 此接口主要用于本地开发时提供文件访问URL
    """
    filePath = os.path.join(UPLOAD_DIR, fileName)
    if not os.path.exists(filePath):
        raise HTTPException(
            status_code=404,
            detail={
                "error": "FILE_NOT_FOUND",
                "message": f"文件不存在: {fileName}",
                "retryable": False,
            },
        )

    # 根据文件扩展名确定 MIME 类型
    ext = os.path.splitext(fileName)[1].lower()
    mimeMap = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".jfif": "image/jpeg",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }
    mediaType = mimeMap.get(ext, "application/octet-stream")
    return FileResponse(filePath, media_type=mediaType)


@router.get("/limits")
async def getLimits():
    """
    获取当前服务限制信息
    NOTE: 免费试用状态下的限制
    """
    return {
        "plan": "免费试用",
        "concurrent": 1,
        "pricePerSecond": 1.0,
        "priceUnit": "元/秒",
        "imageMaxSize": "5MB",
        "imageMaxResolution": "4096x4096",
        "imageFormats": ["JPG", "JPEG", "PNG", "JFIF"],
        "audioMaxDuration": "建议15秒以内",
        "audioFormats": ["MP3", "WAV", "M4A", "AAC"],
        "outputFormat": "MP4",
        "outputResolution": "480P",
        "tips": [
            "图片建议：单人、人脸占比大、正面效果较好",
            "音频过长可能导致效果劣化",
            "输出视频分辨率为480P",
            "生成速度：RTF约20倍（即1秒音频约需20秒处理）",
            "任务结果有效期为12小时",
        ],
    }
