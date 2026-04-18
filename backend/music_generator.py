"""
AI营销音乐生成服务
NOTE: 接入 Mureka API (https://api.mureka.cn) 实现真实的 AI 音乐生成
支持歌曲生成（带歌词人声）、纯音乐生成、AI 歌词生成

Mureka API 核心流程：
1. 发起生成请求 -> 获得异步 task_id
2. 轮询 task_id 状态 -> 获得生成结果（audio_url、image_url 等）
"""

import os
import logging
import uuid
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music-gen", tags=["AI营销音乐"])

# Mureka API 配置
MUREKA_API_KEY = os.getenv("MUREKA_API_KEY", "")
MUREKA_BASE_URL = "https://api.mureka.cn"

# 积分消耗
CREDIT_PER_SONG = 15


def _parseMurekaError(statusCode: int, rawDetail: str) -> str:
    """
    将 Mureka API 原始错误信息解析为用户友好的中文提示
    NOTE: 常见错误含 quota exceeded、rate limit、unauthorized 等
    """
    lower = rawDetail.lower()
    if "exceeded" in lower and "quota" in lower:
        return "API 调用额度已用尽，请检查账户余额"
    if "rate limit" in lower or "too many" in lower:
        return "请求过于频繁，请稍后再试"
    if statusCode == 401 or "unauthorized" in lower or "invalid api key" in lower:
        return "API Key 无效或已过期"
    if statusCode == 403:
        return "API 访问被拒绝，请检查权限"
    return f"Mureka API 调用失败 (HTTP {statusCode})"


# ============== 请求/响应 Schema ==============

class SongGenerateRequest(BaseModel):
    """歌曲生成请求"""
    lyrics: str = Field(default="", description="歌词内容（最大3000字符）")
    prompt: str = Field(default="", description="风格/情绪描述（最大1024字符）")
    model: str = Field(default="auto", description="模型选择: auto, mureka-7.5, mureka-7.6, mureka-o2, mureka-8")
    n: int = Field(default=1, description="生成变体数量（省额度默认1）", ge=1, le=3)
    instrumental: bool = Field(default=False, description="是否为纯音乐模式")
    title: str = Field(default="", description="歌名（仅前端展示用，不传入Mureka API）")
    # NOTE: vocal_id / reference_id / melody_id 可扩展
    vocal: str = Field(default="", description="人声性别偏好提示（前端传入，拼接到 prompt）")


class InstrumentalGenerateRequest(BaseModel):
    """纯音乐生成请求"""
    prompt: str = Field(default="", description="纯音乐风格描述")
    model: str = Field(default="auto", description="模型选择")
    n: int = Field(default=1, description="生成变体数量", ge=1, le=3)


class LyricsGenerateRequest(BaseModel):
    """歌词生成请求"""
    prompt: str = Field(..., description="歌词主题/描述")


class LyricsOptimizeRequest(BaseModel):
    """歌词优化请求 — 通过让 Mureka 重新生成歌词来实现"优化"效果"""
    lyrics: str = Field(..., description="当前歌词")
    prompt: str = Field(default="", description="优化方向描述")


# ============== API 端点 ==============

@router.get("/models")
async def getAvailableModels():
    """
    获取可用的 Mureka 模型列表
    NOTE: 根据 Mureka API 文档提供的模型列表
    """
    models = [
        {"id": "auto", "name": "Auto", "description": "自动选择最佳模型"},
        {"id": "mureka-8", "name": "Mureka 8", "description": "最新旗舰模型，品质最高"},
        {"id": "mureka-o2", "name": "Mureka O2", "description": "推理优化模型"},
        {"id": "mureka-7.6", "name": "Mureka 7.6", "description": "稳定版本，速度快"},
        {"id": "mureka-7.5", "name": "Mureka 7.5", "description": "经典版本"},
    ]
    return {"models": models}


@router.get("/credit-cost")
async def getCreditCost():
    """获取积分消耗"""
    return {"creditPerSong": CREDIT_PER_SONG}


@router.post("/generate")
async def generateMusic(req: SongGenerateRequest):
    """
    生成AI音乐 — 核心入口
    NOTE: 根据 instrumental 标志决定调用歌曲生成还是纯音乐生成
    调用 Mureka API 发起异步任务，返回 task_id 供前端轮询
    """
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=500, detail="Mureka API Key 未配置")

    # 构建 prompt：拼接风格描述 + 人声性别偏好
    finalPrompt = req.prompt
    if req.vocal and not req.instrumental:
        finalPrompt = f"{finalPrompt}, {req.vocal} vocal" if finalPrompt else f"{req.vocal} vocal"

    try:
        # NOTE: Mureka 生成任务可能耗时较长，提高超时阈值
        async with httpx.AsyncClient(timeout=120) as client:
            headers = {
                "Authorization": f"Bearer {MUREKA_API_KEY}",
                "Content-Type": "application/json",
            }

            if req.instrumental:
                # 纯音乐生成
                body: dict = {
                    "model": req.model,
                    "n": req.n,
                }
                if finalPrompt:
                    body["prompt"] = finalPrompt
                resp = await client.post(
                    f"{MUREKA_BASE_URL}/v1/instrumental/generate",
                    headers=headers,
                    json=body,
                )
            else:
                # 歌曲生成（带歌词人声）
                body = {
                    "model": req.model,
                    "n": req.n,
                }
                if req.lyrics:
                    body["lyrics"] = req.lyrics
                if finalPrompt:
                    body["prompt"] = finalPrompt
                resp = await client.post(
                    f"{MUREKA_BASE_URL}/v1/song/generate",
                    headers=headers,
                    json=body,
                )

            if resp.status_code != 200:
                errorDetail = resp.text[:500]
                logger.error(f"Mureka API error: {resp.status_code} - {errorDetail}")
                logger.error(f"Mureka API request body was: {body}")
                # FIXME: 调试期间返回原始错误给前端
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Mureka API 错误 ({resp.status_code}): {errorDetail}",
                )

            result = resp.json()
            taskId = result.get("id", "")
            status = result.get("status", "preparing")

            return {
                "taskId": taskId,
                "status": status,
                "model": result.get("model", req.model),
                "instrumental": req.instrumental,
                "title": req.title,
                "creditCost": CREDIT_PER_SONG,
                "traceId": result.get("trace_id", ""),
            }

    except httpx.TimeoutException as e:
        logger.error(f"Mureka API timeout: {repr(e)}")
        raise HTTPException(
            status_code=504,
            detail="Mureka API 请求超时，服务器响应时间过长，请稍后重试",
        )
    except httpx.ConnectError as e:
        logger.error(f"Mureka API connect error: {repr(e)}")
        raise HTTPException(
            status_code=502,
            detail="无法连接 Mureka API 服务器，请检查网络连接",
        )
    except httpx.HTTPError as e:
        # NOTE: 使用 repr(e) 而非 str(e)，因为某些 httpx 异常的 str() 输出为空
        errMsg = str(e) or repr(e)
        logger.error(f"Mureka API request failed: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"Mureka API 请求异常: {errMsg}")
    except Exception as e:
        logger.error(f"Unexpected error in music generation: {repr(e)}")
        raise HTTPException(status_code=500, detail=f"音乐生成服务异常: {repr(e)}")


@router.get("/task/{taskId}")
async def getTaskStatus(taskId: str, instrumental: bool = False):
    """
    查询音乐生成任务状态
    NOTE: 根据 instrumental 参数调用不同的查询端点
    返回 Mureka 的完整任务信息（status, choices 等）
    """
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=500, detail="Mureka API Key 未配置")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            headers = {
                "Authorization": f"Bearer {MUREKA_API_KEY}",
            }

            if instrumental:
                queryUrl = f"{MUREKA_BASE_URL}/v1/instrumental/query/{taskId}"
            else:
                queryUrl = f"{MUREKA_BASE_URL}/v1/song/query/{taskId}"

            resp = await client.get(queryUrl, headers=headers)

            if resp.status_code != 200:
                logger.warning(f"Mureka task query failed: {resp.status_code}")
                return {"taskId": taskId, "status": "failed", "choices": []}

            result = resp.json()
            status = result.get("status", "unknown")
            choices = result.get("choices", [])
            # FIXME: 调试日志，确认 Mureka 返回的原始数据
            logger.info(f"Mureka task {taskId} status={status}, raw choices={choices}")

            # NOTE: Mureka API 实际字段名：
            # - "url" (MP3) / "flac_url" (FLAC) / "stream_url" (流式) ← 不是 "audio_url"
            # - "lyrics_sections" (数组) ← 不是 "lyrics" 字符串
            normalizedChoices = []
            for choice in choices:
                # 提取歌词：将 lyrics_sections 数组展平为纯文本
                lyricsText = ""
                lyricsSections = choice.get("lyrics_sections", [])
                if lyricsSections:
                    lines = []
                    for section in lyricsSections:
                        for line in section.get("lines", []):
                            lines.append(line.get("text", ""))
                    lyricsText = "\n".join(lines)
                # 兼容：如果 API 直接返回了 lyrics 字符串也用它
                if not lyricsText:
                    lyricsText = choice.get("lyrics", "")

                normalizedChoices.append({
                    "id": choice.get("id", ""),
                    # NOTE: Mureka 的 MP3 音频 URL 字段名是 "url"，不是 "audio_url"
                    "audioUrl": choice.get("url", "") or choice.get("audio_url", ""),
                    "imageUrl": choice.get("image_url", ""),
                    "streamUrl": choice.get("stream_url", ""),
                    "lyrics": lyricsText,
                    "title": choice.get("title", ""),
                    "vocalId": choice.get("vocal_id", ""),
                })

            return {
                "taskId": taskId,
                "status": status,
                "choices": normalizedChoices,
                "failedReason": result.get("failed_reason", ""),
            }

    except httpx.HTTPError as e:
        logger.error(f"Mureka task query error: {e}")
        return {"taskId": taskId, "status": "error", "choices": []}


@router.post("/lyrics/generate")
async def generateLyrics(req: LyricsGenerateRequest):
    """
    AI 歌词生成
    NOTE: 调用 Mureka /v1/lyrics/generate 接口
    """
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=500, detail="Mureka API Key 未配置")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MUREKA_BASE_URL}/v1/lyrics/generate",
                headers={
                    "Authorization": f"Bearer {MUREKA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"prompt": req.prompt},
            )

            if resp.status_code != 200:
                errorDetail = resp.text[:300]
                logger.error(f"Mureka lyrics API error: {resp.status_code} - {errorDetail}")
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=_parseMurekaError(resp.status_code, errorDetail),
                )

            result = resp.json()
            return {
                "title": result.get("title", ""),
                "lyrics": result.get("lyrics", ""),
            }

    except httpx.HTTPError as e:
        logger.error(f"Mureka lyrics API error: {e}")
        raise HTTPException(status_code=500, detail=f"歌词生成请求异常: {str(e)}")


@router.post("/lyrics/optimize")
async def optimizeLyrics(req: LyricsOptimizeRequest):
    """
    歌词优化 — 重新生成更高质量的歌词
    NOTE: 将现有歌词作为上下文传入 Mureka 歌词生成接口重新优化
    """
    if not MUREKA_API_KEY:
        raise HTTPException(status_code=500, detail="Mureka API Key 未配置")

    # 构建优化提示词：将当前歌词作为参考信息
    optimizePrompt = f"请优化以下歌词，使其更有表现力和节奏感：\n{req.lyrics}"
    if req.prompt:
        optimizePrompt += f"\n优化方向：{req.prompt}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{MUREKA_BASE_URL}/v1/lyrics/generate",
                headers={
                    "Authorization": f"Bearer {MUREKA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"prompt": optimizePrompt},
            )

            if resp.status_code != 200:
                errorDetail = resp.text[:300]
                logger.error(f"Mureka lyrics optimize error: {resp.status_code} - {errorDetail}")
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=_parseMurekaError(resp.status_code, errorDetail),
                )

            result = resp.json()
            return {
                "title": result.get("title", ""),
                "lyrics": result.get("lyrics", ""),
            }

    except httpx.HTTPError as e:
        logger.error(f"Mureka lyrics optimize error: {e}")
        raise HTTPException(status_code=500, detail=f"歌词优化请求异常: {str(e)}")


# ============== 参考歌曲 ==============

REFERENCE_DIR = Path(__file__).parent / "uploads" / "references"
REFERENCE_DIR.mkdir(parents=True, exist_ok=True)

# 允许的音频扩展名
ALLOWED_AUDIO_EXTS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}


@router.post("/reference/upload")
async def uploadReference(file: UploadFile = File(...)):
    """
    上传参考歌曲文件
    NOTE: 存储到 backend/uploads/references/ 目录，返回文件名和路径
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="未提供文件")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式，仅支持: {', '.join(ALLOWED_AUDIO_EXTS)}"
        )

    # 生成唯一文件名避免冲突
    uniqueName = f"{uuid.uuid4().hex[:12]}{ext}"
    savePath = REFERENCE_DIR / uniqueName

    content = await file.read()
    savePath.write_bytes(content)

    return {
        "filename": uniqueName,
        "originalName": file.filename,
        "size": len(content),
        "url": f"/api/music-gen/reference/file/{uniqueName}",
    }


@router.get("/reference/file/{filename}")
async def getReferenceFile(filename: str):
    """
    获取参考歌曲文件用于前端播放预览
    """
    filePath = REFERENCE_DIR / filename
    if not filePath.exists() or not filePath.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    ext = filePath.suffix.lower()
    mimeMap = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".aac": "audio/aac",
    }
    contentType = mimeMap.get(ext, "application/octet-stream")

    def iterFile():
        with open(filePath, "rb") as f:
            while chunk := f.read(8192):
                yield chunk

    return StreamingResponse(iterFile(), media_type=contentType)


@router.delete("/reference/{filename}")
async def deleteReference(filename: str):
    """
    删除参考歌曲文件
    """
    filePath = REFERENCE_DIR / filename
    if filePath.exists() and filePath.is_file():
        filePath.unlink()
        return {"deleted": True}
    raise HTTPException(status_code=404, detail="文件不存在")
