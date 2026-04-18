"""
水印/字幕消除服务
NOTE: 接入 RunningHub ComfyUI 工作流，分两条独立管线：
  - 图像去水印：只需上传图片，调用 AI 应用 1939683977558925314
  - 视频去字幕：需要上传视频 + 提示词 + 时长 + 帧率，调用 AI 应用 2012077432525824001
两条管线均使用 RunningHub 的文件上传 → 任务提交 → 轮询结果 的标准流程
"""

import os
import time
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watermark-removal", tags=["水印/字幕消除"])

# ==================== RunningHub 配置 ====================

RUNNINGHUB_API_KEY = os.getenv(
    "RUNNINGHUB_API_KEY",
    "60cd28720e2d46bfba129295205d04df",
)
RUNNINGHUB_BASE = "https://www.runninghub.cn/openapi/v2"

# 图像去水印 AI 应用 ID
IMAGE_APP_ID = "1939683977558925314"
# 视频去字幕 AI 应用 ID
VIDEO_APP_ID = "2012077432525824001"

# 积分消耗配置
CREDIT_COST_IMAGE = 5
CREDIT_COST_VIDEO = 15

# 轮询配置
POLL_INTERVAL = 5       # 每次轮询间隔（秒）
POLL_MAX_IMAGE = 120    # 图片最大等待时间（秒）
POLL_MAX_VIDEO = 600    # 视频最大等待时间（秒）


# ==================== 响应模型 ====================

class TaskSubmitResponse(BaseModel):
    """任务提交响应"""
    taskId: str = Field(..., description="RunningHub 任务 ID")
    status: str = Field(default="processing", description="任务状态")
    creditCost: int = Field(description="消耗算力")
    taskType: str = Field(description="任务类型: image / video")


class TaskStatusResponse(BaseModel):
    """任务状态查询响应"""
    taskId: str
    status: str = Field(description="QUEUED / RUNNING / SUCCESS / FAILED")
    resultUrl: str = Field(default="", description="结果文件 CDN 地址")
    outputType: str = Field(default="", description="输出文件类型")
    errorMessage: str = Field(default="")


# ==================== 公共工具函数 ====================

async def uploadToRunningHub(fileBytes: bytes, filename: str) -> str:
    """
    上传文件到 RunningHub，返回 fileName 字段（用于后续节点引用）
    """
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{RUNNINGHUB_BASE}/media/upload/binary",
            headers={"Authorization": f"Bearer {RUNNINGHUB_API_KEY}"},
            files={"file": (filename, fileBytes)},
        )
    if resp.status_code != 200:
        logger.error(f"RunningHub upload failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=502, detail=f"文件上传失败: {resp.text}")

    data = resp.json()
    if data.get("code") != 0:
        raise HTTPException(status_code=502, detail=f"文件上传失败: {data.get('message')}")

    fileName = data["data"]["fileName"]
    logger.info(f"Uploaded to RunningHub: {fileName}")
    return fileName


async def submitTask(appId: str, nodeInfoList: list) -> str:
    """
    提交 RunningHub AI 应用任务，返回 taskId
    """
    payload = {
        "nodeInfoList": nodeInfoList,
        "instanceType": "default",
        "usePersonalQueue": "false",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{RUNNINGHUB_BASE}/run/ai-app/{appId}",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {RUNNINGHUB_API_KEY}",
            },
            json=payload,
        )
    if resp.status_code != 200:
        logger.error(f"RunningHub submit failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=502, detail=f"任务提交失败: {resp.text}")

    result = resp.json()
    taskId = result.get("taskId")
    if not taskId:
        raise HTTPException(status_code=502, detail=f"任务提交异常: {result}")

    logger.info(f"Task submitted: {taskId}, status: {result.get('status')}")
    return taskId


async def queryTask(taskId: str) -> dict:
    """
    查询 RunningHub 任务状态
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{RUNNINGHUB_BASE}/query",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {RUNNINGHUB_API_KEY}",
            },
            json={"taskId": taskId},
        )
    if resp.status_code != 200:
        return {"status": "FAILED", "errorMessage": f"Query error: {resp.status_code}"}
    return resp.json()


# ==================== 图像去水印接口 ====================

@router.post("/image/submit", response_model=TaskSubmitResponse)
async def submitImageWatermarkRemoval(
    file: UploadFile = File(..., description="要去除水印的图片文件"),
):
    """
    图像去水印 — 只需上传图片
    流程：上传到 RunningHub → 提交 AI 应用任务 → 返回 taskId
    前端后续通过 /task/{taskId} 轮询获取结果
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")

    fileBytes = await file.read()
    filename = file.filename or "upload.png"

    # 步骤1: 上传图片到 RunningHub
    rhFileName = await uploadToRunningHub(fileBytes, filename)

    # 步骤2: 提交去水印任务
    nodeInfoList = [
        {
            "nodeId": "191",
            "fieldName": "image",
            "fieldValue": rhFileName,
            "description": "上传水印图",
        }
    ]
    taskId = await submitTask(IMAGE_APP_ID, nodeInfoList)

    return TaskSubmitResponse(
        taskId=taskId,
        status="processing",
        creditCost=CREDIT_COST_IMAGE,
        taskType="image",
    )


# ==================== 视频去字幕接口 ====================

@router.post("/video/submit", response_model=TaskSubmitResponse)
async def submitVideoSubtitleRemoval(
    file: UploadFile = File(..., description="要去除字幕的视频文件"),
    prompt: str = Form(
        default="Remove watermarks and remove Sora text and icons, as well as Seedance text and icons",
        description="提示词 — 描述要移除的内容",
    ),
    duration: int = Form(default=5, ge=1, le=60, description="视频时长（秒）"),
    fps: int = Form(default=16, description="每秒帧数（16 或 24）"),
):
    """
    视频去字幕 — 需要视频 + 提示词 + 时长 + 帧率
    流程：上传到 RunningHub → 提交 AI 应用任务 → 返回 taskId
    """
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="请上传视频文件")

    # 帧率限定为 16 或 24
    if fps not in (16, 24):
        fps = 16

    fileBytes = await file.read()
    filename = file.filename or "upload.mp4"

    # 步骤1: 上传视频到 RunningHub
    rhFileName = await uploadToRunningHub(fileBytes, filename)

    # 步骤2: 提交去字幕任务
    nodeInfoList = [
        {
            "nodeId": "142",
            "fieldName": "video",
            "fieldValue": rhFileName,
            "description": "加载视频",
        },
        {
            "nodeId": "143",
            "fieldName": "value",
            "fieldValue": str(duration),
            "description": "视频时长",
        },
        {
            "nodeId": "138",
            "fieldName": "value",
            "fieldValue": str(fps),
            "description": "每秒帧数（16或者24）",
        },
        {
            "nodeId": "128",
            "fieldName": "text",
            "fieldValue": prompt,
            "description": "输入提示词",
        },
    ]
    taskId = await submitTask(VIDEO_APP_ID, nodeInfoList)

    return TaskSubmitResponse(
        taskId=taskId,
        status="processing",
        creditCost=CREDIT_COST_VIDEO,
        taskType="video",
    )


# ==================== 任务状态查询（通用） ====================

@router.get("/task/{taskId}", response_model=TaskStatusResponse)
async def getTaskStatus(taskId: str):
    """
    查询任务状态 — 图像和视频共用
    返回当前状态，如果已完成则附带结果 URL
    """
    result = await queryTask(taskId)
    status = result.get("status", "UNKNOWN")
    resultUrl = ""
    outputType = ""
    errorMessage = result.get("errorMessage", "")

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
            resultUrl = results[0].get("url", "")
            outputType = results[0].get("outputType", "")

    return TaskStatusResponse(
        taskId=taskId,
        status=status,
        resultUrl=resultUrl,
        outputType=outputType,
        errorMessage=errorMessage,
    )


# ==================== 积分查询 ====================

@router.get("/credit-cost")
async def getCreditCost():
    """获取图片和视频的算力消耗"""
    return {
        "image": CREDIT_COST_IMAGE,
        "video": CREDIT_COST_VIDEO,
    }
