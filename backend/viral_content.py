"""
爆款拆解复刻服务
NOTE: 接入 RunningHub ComfyUI 工作流，分两阶段：
  - 第一阶段（反推提示词）：上传视频 → AI App 2025937761244553217 → 返回 txt 提示词
  - 第二阶段（爆款视频复刻）：提示词 + 参数 → AI App 1950210718891204609 → 返回视频
两阶段均使用 RunningHub 的文件上传 → 任务提交 → 轮询结果 的标准流程
"""

import os
import logging

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/viral-content", tags=["爆款拆解复刻"])

# ==================== RunningHub 配置 ====================

RUNNINGHUB_API_KEY = os.getenv(
    "RUNNINGHUB_API_KEY",
    "60cd28720e2d46bfba129295205d04df",
)
RUNNINGHUB_BASE = "https://www.runninghub.cn/openapi/v2"

# 第一阶段：反推提示词 AI 应用 ID
PHASE1_APP_ID = "2025937761244553217"
# 第二阶段：爆款视频复刻 AI 应用 ID
PHASE2_APP_ID = "1950210718891204609"


# ==================== 响应模型 ====================

class TaskSubmitResponse(BaseModel):
    """任务提交响应"""
    taskId: str = Field(..., description="RunningHub 任务 ID")
    status: str = Field(default="processing", description="任务状态")
    phase: int = Field(description="所属阶段: 1 或 2")


class TaskStatusResponse(BaseModel):
    """任务状态查询响应"""
    taskId: str
    status: str = Field(description="QUEUED / RUNNING / SUCCESS / FAILED")
    resultUrl: str = Field(default="", description="结果文件 CDN 地址")
    outputType: str = Field(default="", description="输出文件类型(txt/mp4等)")
    resultText: str = Field(default="", description="纯文本结果(第一阶段)")
    errorMessage: str = Field(default="")


# ==================== 公共工具函数 ====================

async def uploadToRunningHub(fileBytes: bytes, filename: str) -> str:
    """
    上传文件到 RunningHub，返回 fileName 字段（用于后续节点引用）
    NOTE: 上传成功后返回的 fileName 是 RunningHub 内部路径，有效期 1 天
    """
    async with httpx.AsyncClient(timeout=300) as client:
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


async def submitTask(appId: str, nodeInfoList: list, instanceType: str = "default") -> str:
    """
    提交 RunningHub AI 应用任务，返回 taskId
    NOTE: instanceType="default" 为 24G 显存，"plus" 为 48G 显存
    高清版视频生成需要更大显存，自动升级为 plus 模式
    """
    payload = {
        "nodeInfoList": nodeInfoList,
        "instanceType": instanceType,
        "usePersonalQueue": "false",
    }
    logger.info(f"submitTask appId={appId}, instanceType={instanceType}")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{RUNNINGHUB_BASE}/run/ai-app/{appId}",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {RUNNINGHUB_API_KEY}",
            },
            json=payload,
        )
    logger.info(f"RunningHub response: {resp.status_code} {resp.text[:500]}")
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
    NOTE: 返回完整的状态响应，包含 status / results / errorMessage
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


# ==================== 第一阶段：反推提示词 ====================

@router.post("/phase1/submit", response_model=TaskSubmitResponse)
async def submitPhase1(
    file: UploadFile = File(..., description="上传需要拆解的视频文件"),
):
    """
    第一阶段：上传视频 → 反推提示词
    NOTE: 上传视频到 RunningHub → 提交 AI App 任务 → 返回 taskId
    前端后续通过 /task/{taskId} 轮询获取 txt 提示词结果
    """
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="请上传视频文件（MP4/MOV等格式）")

    fileBytes = await file.read()
    filename = file.filename or "upload.mp4"

    # 步骤1: 上传视频到 RunningHub
    rhFileName = await uploadToRunningHub(fileBytes, filename)

    # 步骤2: 提交反推提示词任务
    # NOTE: nodeId=2 对应视频输入节点
    nodeInfoList = [
        {
            "nodeId": "2",
            "fieldName": "file",
            "fieldValue": rhFileName,
            "description": "上传需要拆解的视频",
        }
    ]
    taskId = await submitTask(PHASE1_APP_ID, nodeInfoList)

    return TaskSubmitResponse(
        taskId=taskId,
        status="processing",
        phase=1,
    )


# ==================== 第二阶段：爆款视频复刻 ====================

@router.post("/phase2/submit", response_model=TaskSubmitResponse)
async def submitPhase2(
    prompt: str = Form(..., description="提示词文本"),
    duration: str = Form(default="5", description="时长（秒）"),
    quality: str = Form(default="2", description="1=高清版, 2=极速版"),
    ratio: str = Form(default="4", description="1=1:1, 2=3:4, 3=4:3, 4=9:16, 5=16:9"),
):
    """
    第二阶段：提示词 + 参数 → 复刻爆款视频
    NOTE: 将第一阶段的反推提示词和用户设置的参数提交到 RunningHub AI App
    视频生成耗时较长（通常 3-10 分钟），前端需做长时间等待提示
    """
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="提示词不能为空")

    # 构建节点参数列表，按 API 文档映射
    nodeInfoList = [
        {
            "nodeId": "50",
            "fieldName": "value",
            "fieldValue": duration,
            "description": "设置时长（秒）",
        },
        {
            "nodeId": "94",
            "fieldName": "select",
            "fieldValue": quality,
            "description": "高清版/极速版切换",
        },
        {
            "nodeId": "144",
            "fieldName": "select",
            "fieldValue": ratio,
            "description": "设置比例",
        },
        {
            "nodeId": "120",
            "fieldName": "select",
            "fieldValue": "2",
            "description": "文本输入方式（手动输入文本, 0-indexed: list_2）",
        },
        {
            "nodeId": "90",
            "fieldName": "text",
            "fieldValue": prompt,
            "description": "手写/润色文本输入框",
        },
    ]
    # NOTE: 高清版(quality=1) 需要更大显存，使用 plus 模式(48G)
    instance = "plus" if quality == "1" else "default"
    logger.info(f"Phase2 submit — quality={quality}, instance={instance}, prompt[:80]={prompt[:80]}")
    taskId = await submitTask(PHASE2_APP_ID, nodeInfoList, instanceType=instance)

    return TaskSubmitResponse(
        taskId=taskId,
        status="processing",
        phase=2,
    )


# ==================== 通用任务状态查询 ====================

@router.get("/task/{taskId}", response_model=TaskStatusResponse)
async def getTaskStatus(taskId: str):
    """
    查询任务状态 — 第一阶段和第二阶段共用
    NOTE: 第一阶段成功时 results 中 outputType=txt，text 字段包含提示词
          第二阶段成功时 results 中 outputType=mp4，url 字段包含视频地址
    """
    result = await queryTask(taskId)
    status = result.get("status", "UNKNOWN")
    resultUrl = ""
    outputType = ""
    resultText = ""
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
            # 遍历所有结果节点，提取有效输出
            for r in results:
                rType = r.get("outputType", "")
                if rType == "txt":
                    # 第一阶段：txt 提示词结果
                    resultText = r.get("text", "")
                    resultUrl = r.get("url", "")
                    outputType = "txt"
                elif rType in ("mp4", "webm", "mov"):
                    # 第二阶段：视频结果
                    resultUrl = r.get("url", "")
                    outputType = rType
                elif rType in ("png", "jpg", "jpeg", "webp"):
                    # 可能的图片结果
                    if not resultUrl:
                        resultUrl = r.get("url", "")
                        outputType = rType

            # HACK: 如果 txt 结果的 text 字段为空但有 url，前端可通过 url 自行下载解析
            if outputType == "txt" and not resultText and resultUrl:
                try:
                    async with httpx.AsyncClient(timeout=15) as client:
                        txtResp = await client.get(resultUrl)
                        if txtResp.status_code == 200:
                            resultText = txtResp.text
                except Exception as e:
                    logger.warning(f"Failed to download txt result: {e}")

    return TaskStatusResponse(
        taskId=taskId,
        status=status,
        resultUrl=resultUrl,
        outputType=outputType,
        resultText=resultText,
        errorMessage=errorMessage,
    )
