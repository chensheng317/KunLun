"""
图片生成服务
NOTE: 支持两种生成模式
  1. 基础图片生成 — 调用 Nano Banana (Gemini) API（需付费账户，暂不可用）
  2. 快捷应用 — 调用 RunningHub ComfyUI 工作流 API（一键商品图 / 一键模特图）
"""

import os
import uuid
import base64
import logging
from typing import Optional
from enum import Enum

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/image-gen", tags=["图片生成"])

# 积分消耗：按张数计费
CREDIT_PER_IMAGE = 8

# 上传文件存储
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads", "image-gen")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 生成结果输出目录
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs", "image-gen")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# RunningHub API 配置
RUNNINGHUB_API_KEY = os.getenv("RUNNINGHUB_API_KEY", "")
RUNNINGHUB_BASE_URL = "https://www.runninghub.cn"

# RunningHub AI App 工作流 ID
# NOTE: 一键商品图 — 商品图片生成工作流，上传一张商品图片 → AI 自动生成高质量商品主图
PRODUCT_APP_ID = "2020427085151473666"
# NOTE: 一键模特图 — 图片生成工作流 (RunningHub API)，输入提示词 + 比例 + 张数
MODEL_APP_ID = "1983009649588875265"


# ============ 枚举定义 ============


class ImageModel(str, Enum):
    """
    可选的基础生图模型
    NOTE: 通过 Gemini API 调用（暂不可用）
    """
    NANO_BANANA_2 = "gemini-3.1-flash-image-preview"
    NANO_BANANA_PRO = "gemini-3-pro-image-preview"
    NANO_BANANA = "gemini-2.5-flash-image"


class ImageQuality(str, Enum):
    """清晰度选项"""
    STANDARD = "standard"
    HD = "hd"
    ULTRA_HD = "ultra_hd"


class AspectRatio(str, Enum):
    """画幅比例"""
    SQUARE = "1:1"
    PORTRAIT = "3:4"
    LANDSCAPE = "4:3"
    WIDE = "16:9"
    TALL = "9:16"


# 清晰度 → imageSize 参数映射
QUALITY_TO_IMAGE_SIZE = {
    "standard": "1K",
    "hd": "2K",
    "ultra_hd": "4K",
}


# ============ 响应模型 ============


class ImageGenResponse(BaseModel):
    """基础图片生成响应"""
    taskId: str = Field(..., description="任务ID")
    images: list[str] = Field(default_factory=list, description="生成图片URL列表")
    creditCost: int = Field(description="消耗积分")
    model: str = Field(description="使用的模型")
    size: str = Field(description="生成尺寸")


class QuickAppSubmitResponse(BaseModel):
    """快捷应用提交响应"""
    taskId: str = Field(..., description="RunningHub 任务ID")
    creditCost: int = Field(description="消耗积分")


class TaskStatusResponse(BaseModel):
    """任务状态查询响应"""
    status: str = Field(description="任务状态: QUEUED/RUNNING/SUCCESS/FAILED")
    resultUrl: Optional[str] = Field(default=None, description="结果图片 CDN URL")
    results: Optional[list[dict]] = Field(default=None, description="所有结果列表")
    errorMessage: Optional[str] = Field(default=None, description="错误信息")


# ============ RunningHub 通用工具函数 ============


async def uploadToRunningHub(fileContent: bytes, fileName: str) -> str:
    """
    将文件上传到 RunningHub 获取临时 fileName
    NOTE: 返回的 fileName 有效期仅 1 天，不可缓存复用
    参考 /runninghub-api-pitfalls workflow #5
    """
    uploadUrl = f"{RUNNINGHUB_BASE_URL}/openapi/v2/media/upload/binary"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            uploadUrl,
            headers={"Authorization": f"Bearer {RUNNINGHUB_API_KEY}"},
            files={"file": (fileName, fileContent)},
        )

        if resp.status_code != 200:
            logger.error(f"RunningHub upload failed: {resp.status_code} - {resp.text[:300]}")
            raise HTTPException(status_code=502, detail="File upload to RunningHub failed")

        data = resp.json()
        # 响应格式: { code: 0, data: { fileName: "openapi/xxx.png", download_url: "..." } }
        if data.get("code") != 0:
            logger.error(f"RunningHub upload error: {data}")
            raise HTTPException(status_code=502, detail="RunningHub upload returned error")

        rhFileName = data.get("data", {}).get("fileName", "")
        if not rhFileName:
            raise HTTPException(status_code=502, detail="RunningHub upload returned empty fileName")

        logger.info(f"Uploaded to RunningHub: {rhFileName}")
        return rhFileName


async def submitRunningHubApp(appId: str, nodeInfoList: list, instanceType: str = "default") -> str:
    """
    提交 RunningHub AI App 任务
    返回 taskId
    """
    submitUrl = f"{RUNNINGHUB_BASE_URL}/openapi/v2/run/ai-app/{appId}"

    payload = {
        "nodeInfoList": nodeInfoList,
        "instanceType": instanceType,
        "usePersonalQueue": "false",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            submitUrl,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {RUNNINGHUB_API_KEY}",
            },
            json=payload,
        )

        if resp.status_code != 200:
            logger.error(f"RunningHub submit failed: {resp.status_code} - {resp.text[:300]}")
            raise HTTPException(status_code=502, detail="RunningHub task submission failed")

        result = resp.json()
        taskId = result.get("taskId")
        if not taskId:
            logger.error(f"RunningHub submit returned no taskId: {result}")
            raise HTTPException(status_code=502, detail="RunningHub returned no taskId")

        logger.info(f"RunningHub task submitted: {taskId} (app={appId})")
        return taskId


async def queryRunningHubTask(taskId: str) -> dict:
    """
    查询 RunningHub 任务状态
    返回原始响应 dict
    """
    queryUrl = f"{RUNNINGHUB_BASE_URL}/openapi/v2/query"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            queryUrl,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {RUNNINGHUB_API_KEY}",
            },
            json={"taskId": taskId},
        )

        if resp.status_code != 200:
            logger.error(f"RunningHub query failed: {resp.status_code} - {resp.text[:200]}")
            raise HTTPException(status_code=502, detail="RunningHub task query failed")

        return resp.json()


# ============ 路由：快捷应用 ============


@router.post("/product/submit", response_model=QuickAppSubmitResponse)
async def submitProductImage(
    file: UploadFile = File(..., description="商品图片文件"),
):
    """
    一键商品图 — 商品图片生成
    NOTE: 上传商品图片 → RunningHub 工作流自动生成高质量商品主图
    流程：1. 上传图片到 RunningHub  2. 提交 AI App 工作流任务
    """
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=500, detail="RUNNINGHUB_API_KEY not configured")

    # 读取文件内容
    fileContent = await file.read()
    originalName = file.filename or "product.jpg"

    # 保存到本地（备份）
    localPath = os.path.join(UPLOAD_DIR, f"product_{uuid.uuid4().hex[:8]}_{originalName}")
    with open(localPath, "wb") as f:
        f.write(fileContent)

    # 步骤 1：上传到 RunningHub
    rhFileName = await uploadToRunningHub(fileContent, originalName)

    # 步骤 2：提交一键商品图工作流
    nodeInfoList = [
        {
            "nodeId": "219",
            "fieldName": "image",
            "fieldValue": rhFileName,
            "description": "传入图片",
        }
    ]

    taskId = await submitRunningHubApp(PRODUCT_APP_ID, nodeInfoList)

    return QuickAppSubmitResponse(
        taskId=taskId,
        creditCost=CREDIT_PER_IMAGE,
    )


@router.post("/model/submit", response_model=QuickAppSubmitResponse)
async def submitModelImage(
    prompt: str = Form(..., description="文本提示词"),
    ratio: str = Form(default="4", description="图片比例 (1=1:1, 2=3:4, 3=4:3, 4=9:16, 5=16:9)"),
    count: str = Form(default="1", description="生成张数 (1-4)"),
):
    """
    一键模特图 — 图片生成 (RunningHub API)
    NOTE: 输入提示词 → RunningHub 工作流自动生成高质量模特图
    比例参数映射：1=1:1, 2=3:4, 3=4:3, 4=9:16, 5=16:9
    """
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=500, detail="RUNNINGHUB_API_KEY not configured")

    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    nodeInfoList = [
        {
            "nodeId": "114",
            "fieldName": "text",
            "fieldValue": prompt.strip(),
            "description": "提示词",
        },
        {
            "nodeId": "141",
            "fieldName": "select",
            "fieldValue": str(ratio),
            "description": "图片比例",
        },
        {
            "nodeId": "123",
            "fieldName": "value",
            "fieldValue": str(count),
            "description": "生成几张",
        },
    ]

    taskId = await submitRunningHubApp(MODEL_APP_ID, nodeInfoList)

    return QuickAppSubmitResponse(
        taskId=taskId,
        creditCost=CREDIT_PER_IMAGE * int(count),
    )


@router.get("/task/{taskId}", response_model=TaskStatusResponse)
async def getTaskStatus(taskId: str):
    """
    查询快捷应用任务状态
    NOTE: 前端轮询此接口获取任务进度
    当 status=SUCCESS 时，resultUrl 为第一张结果图的 CDN 链接
    """
    result = await queryRunningHubTask(taskId)

    status = result.get("status", "UNKNOWN")
    errorMessage = result.get("errorMessage", "")
    resultUrl = None
    allResults = None

    # NOTE: RunningHub FAILED 响应中，具体错误藏在 failedReason 对象里
    if status == "FAILED":
        failedReason = result.get("failedReason") or {}
        detailedMessage = failedReason.get("exception_message", "")
        exceptionType = failedReason.get("exception_type", "")
        nodeName = failedReason.get("node_name", "")
        if detailedMessage:
            errorMessage = detailedMessage
        elif exceptionType:
            errorMessage = f"工作流节点 {nodeName} 异常: {exceptionType}"
        logger.warning(f"RunningHub task FAILED: type={exceptionType}, node={nodeName}")

    if status == "SUCCESS":
        results = result.get("results", [])
        if results:
            # 取第一张图片的 URL
            resultUrl = results[0].get("url", "")
            # 返回所有结果（一键模特图可能生成多张）
            allResults = [
                {"url": r.get("url", ""), "outputType": r.get("outputType", "")}
                for r in results
                if r.get("url")
            ]

    return TaskStatusResponse(
        status=status,
        resultUrl=resultUrl,
        results=allResults,
        errorMessage=errorMessage if errorMessage else None,
    )


# ============ 路由：基础图片生成（Nano Banana — 暂不可用） ============


@router.get("/credit-cost")
async def getCreditCost(count: int = 1):
    """获取积分消耗，根据张数计算"""
    return {
        "creditPerImage": CREDIT_PER_IMAGE,
        "totalCost": CREDIT_PER_IMAGE * count,
    }


@router.get("/models")
async def getAvailableModels():
    """获取可用的生图模型列表"""
    return {
        "models": [
            {
                "id": "gemini-3.1-flash-image-preview",
                "name": "Nano Banana 2 (Flash)",
                "description": "最佳性价比，综合性能与速度平衡",
            },
            {
                "id": "gemini-3-pro-image-preview",
                "name": "Nano Banana Pro",
                "description": "专业级，支持 4K 分辨率",
            },
            {
                "id": "gemini-2.5-flash-image",
                "name": "Nano Banana (经典)",
                "description": "高速低延迟，高吞吐场景首选",
            },
        ]
    }


@router.post("/generate", response_model=ImageGenResponse)
async def generateImage(
    prompt: str = Form(..., description="生成提示词"),
    model: str = Form(default="gemini-3.1-flash-image-preview", description="模型"),
    quality: str = Form(default="hd", description="清晰度"),
    count: int = Form(default=1, ge=1, le=4, description="张数"),
    aspectRatio: str = Form(default="1:1", description="画幅比例"),
    negativePrompt: str = Form(default="", description="反向提示词"),
    referenceImage: Optional[UploadFile] = File(default=None, description="参考图"),
):
    """
    基础图片生成（Nano Banana / Gemini API）
    NOTE: 需绑定 Google 付费账户才能调用，当前返回占位图
    """
    # HACK: 暂不可用，直接返回占位图提示
    taskId = str(uuid.uuid4())
    totalCost = CREDIT_PER_IMAGE * count

    generatedImages = [
        f"https://placehold.co/1024x1024/1a1a2e/3eede7?text=Nano+Banana+{i+1}&font=noto-sans-sc"
        for i in range(count)
    ]

    return ImageGenResponse(
        taskId=taskId,
        images=generatedImages,
        creditCost=totalCost,
        model=model,
        size=QUALITY_TO_IMAGE_SIZE.get(quality, "2K"),
    )


@router.get("/output/{fileName}")
async def getOutputImage(fileName: str):
    """
    获取生成的图片文件
    NOTE: 提供本地文件的 HTTP 访问能力
    """
    from fastapi.responses import FileResponse

    filePath = os.path.join(OUTPUT_DIR, fileName)
    if not os.path.exists(filePath):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filePath)
