"""
视频生成服务
NOTE: 支持两种生成模式
  1. 基础视频生成 — 调用 Veo API（需付费账户，暂不可用）
  2. 快捷应用 — 调用 RunningHub ComfyUI 工作流 API
     - 视频高清修复（提升视频分辨率）
     - 一键广告视频（视频生成，高质量广告素材）
     - 角色替换（替换视频中人物形象）
     - 动作迁移（让图片人物模仿视频动作）

设计决策：
  - 复用与 image_generator.py 相同的 RunningHub 上传/提交/查询三件套
  - 所有枚举值标注验证状态（参考 /runninghub-api-pitfalls #1）
  - 文件上传每次重新上传，不缓存 fileName（有效期仅 1 天）
"""

import os
import uuid
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/video-gen", tags=["视频生成"])

# 上传文件存储
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads", "video-gen")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 生成结果输出目录
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs", "video-gen")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# RunningHub API 配置
RUNNINGHUB_API_KEY = os.getenv("RUNNINGHUB_API_KEY", "")
RUNNINGHUB_BASE_URL = "https://www.runninghub.cn"

# RunningHub AI App 工作流 ID
# NOTE: 各快捷应用对应的 AI App ID，从 API 文档中提取
UPSCALE_APP_ID = "1986474629931954178"           # 视频高清修复
AD_VIDEO_APP_ID = "2012900045045112833"          # 一键广告视频
CHAR_REPLACE_APP_ID = "1977224256822104065"      # 角色替换
MOTION_TRANSFER_APP_ID = "2034683970738196481"   # 动作迁移


# ============ 响应模型 ============


class QuickAppSubmitResponse(BaseModel):
    """快捷应用提交响应"""
    taskId: str = Field(..., description="RunningHub 任务ID")
    creditCost: int = Field(description="消耗积分")


class TaskStatusResponse(BaseModel):
    """任务状态查询响应"""
    status: str = Field(description="任务状态: QUEUED/RUNNING/SUCCESS/FAILED")
    resultUrl: Optional[str] = Field(default=None, description="第一个结果的 CDN URL")
    results: Optional[list[dict]] = Field(default=None, description="所有结果列表")
    errorMessage: Optional[str] = Field(default=None, description="错误信息")


# ============ RunningHub 通用工具函数 ============
# NOTE: 与 image_generator.py 中的函数逻辑完全一致
# 考虑到项目当前规模，就近复制避免引入跨模块依赖


async def uploadToRunningHub(fileContent: bytes, fileName: str) -> str:
    """
    将文件上传到 RunningHub 获取临时 fileName
    NOTE: 返回的 fileName 有效期仅 1 天，不可缓存复用
    参考 /runninghub-api-pitfalls workflow #5
    """
    uploadUrl = f"{RUNNINGHUB_BASE_URL}/openapi/v2/media/upload/binary"

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            uploadUrl,
            headers={"Authorization": f"Bearer {RUNNINGHUB_API_KEY}"},
            files={"file": (fileName, fileContent)},
        )

        if resp.status_code != 200:
            logger.error(f"RunningHub upload failed: {resp.status_code} - {resp.text[:300]}")
            raise HTTPException(status_code=502, detail="File upload to RunningHub failed")

        data = resp.json()
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


# ============ 路由：视频高清修复 ============


@router.post("/upscale/submit", response_model=QuickAppSubmitResponse)
async def submitVideoUpscale(
    file: UploadFile = File(..., description="要修复的原视频文件"),
):
    """
    视频高清修复 — 提高视频分辨率
    NOTE: 仅需一个视频输入
    节点映射：nodeId=18, fieldName=video
    """
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=500, detail="RUNNINGHUB_API_KEY not configured")

    fileContent = await file.read()
    originalName = file.filename or "video.mp4"

    # 保存到本地（备份）
    localPath = os.path.join(UPLOAD_DIR, f"upscale_{uuid.uuid4().hex[:8]}_{originalName}")
    with open(localPath, "wb") as f:
        f.write(fileContent)

    # 上传到 RunningHub
    rhFileName = await uploadToRunningHub(fileContent, originalName)

    # 构建节点参数
    nodeInfoList = [
        {
            "nodeId": "18",
            "fieldName": "video",
            "fieldValue": rhFileName,
            "description": "video",
        }
    ]

    # NOTE: 视频处理需要 plus 实例（48G 显存），否则触发显存不足告警
    taskId = await submitRunningHubApp(UPSCALE_APP_ID, nodeInfoList, instanceType="plus")

    return QuickAppSubmitResponse(taskId=taskId, creditCost=10)


# ============ 路由：一键广告视频 ============


@router.post("/ad-video/submit", response_model=QuickAppSubmitResponse)
async def submitAdVideo(
    file: UploadFile = File(..., description="产品图片"),
    enableCreativeAd: str = Form(default="true", description="创意广告开启"),
    removeBackground: str = Form(default="false", description="去除原背景"),
    creativeRendering: str = Form(default="1", description="广告创意渲染(1-8)"),
    adResolution: str = Form(default="6", description="广告图输出分辨率(固定grok4.0)"),
    adCreativeText: str = Form(default="", description="广告创意补充文本"),
    enable4K: str = Form(default="false", description="广告图4K开启"),
    enableVideoMake: str = Form(default="true", description="视频制作开启"),
    shootingMethod: str = Form(default="1", description="视频拍摄手法(1-16)"),
    videoCreativeText: str = Form(default="", description="视频创意补充文本"),
):
    """
    一键广告视频 — 视频生成 (RunningHub API)，高质量广告素材
    NOTE: 参数较多，10 个节点需要配置
    输出：广告视频 + 广告图片 + 对应提示词
    """
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=500, detail="RUNNINGHUB_API_KEY not configured")

    fileContent = await file.read()
    originalName = file.filename or "product.png"

    # 保存到本地
    localPath = os.path.join(UPLOAD_DIR, f"ad_{uuid.uuid4().hex[:8]}_{originalName}")
    with open(localPath, "wb") as f:
        f.write(fileContent)

    # 上传到 RunningHub
    rhFileName = await uploadToRunningHub(fileContent, originalName)

    # 构建节点参数 — 对照 API 文档 nodeId 映射
    nodeInfoList = [
        {
            "nodeId": "1",
            "fieldName": "image",
            "fieldValue": rhFileName,
            "description": "产品图",
        },
        {
            "nodeId": "163",
            "fieldName": "value",
            "fieldValue": enableCreativeAd,
            "description": "创意广告开启",
        },
        {
            "nodeId": "119",
            "fieldName": "value",
            "fieldValue": removeBackground,
            "description": "去除原背景（更好发挥AI创意）",
        },
        {
            "nodeId": "181",
            "fieldName": "select",
            "fieldValue": creativeRendering,
            "description": "广告创意渲染",
        },
        {
            "nodeId": "152",
            "fieldName": "select",
            "fieldValue": adResolution,
            "description": "广告图输出分辨率",
        },
        {
            "nodeId": "54",
            "fieldName": "text",
            "fieldValue": adCreativeText,
            "description": "广告创意补充，无特殊要求不填写",
        },
        {
            "nodeId": "66",
            "fieldName": "value",
            "fieldValue": enable4K,
            "description": "广告图4K开启（默认1K）",
        },
        {
            "nodeId": "38",
            "fieldName": "value",
            "fieldValue": enableVideoMake,
            "description": "视频制作开启",
        },
        {
            "nodeId": "75",
            "fieldName": "select",
            "fieldValue": shootingMethod,
            "description": "视频拍摄手法",
        },
        {
            "nodeId": "76",
            "fieldName": "text",
            "fieldValue": videoCreativeText,
            "description": "视频创意补充，无特殊要求不填写",
        },
    ]

    # NOTE: 视频制作需要 plus 实例（48G 显存）
    taskId = await submitRunningHubApp(AD_VIDEO_APP_ID, nodeInfoList, instanceType="plus")

    return QuickAppSubmitResponse(taskId=taskId, creditCost=15)


# ============ 路由：角色替换 ============


@router.post("/char-replace/submit", response_model=QuickAppSubmitResponse)
async def submitCharReplace(
    video: UploadFile = File(..., description="参考视频"),
    image: UploadFile = File(..., description="要替换的模特图"),
    prompt: str = Form(default="", description="提示词"),
    replaceType: str = Form(default="1", description="替换类型: 1=完整替换, 2=仅换装, 3=仅换脸(经验证)"),
    duration: str = Form(default="5", description="视频时长(秒, 0-30)"),
):
    """
    角色替换 — 将视频中的人物替换成图片中的形象
    NOTE: 需要上传两个文件（视频+图片）
    替换类型枚举值标注「待验证」— 遵循 /runninghub-api-pitfalls #1
    """
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=500, detail="RUNNINGHUB_API_KEY not configured")

    videoContent = await video.read()
    imageContent = await image.read()
    videoName = video.filename or "reference.mp4"
    imageName = image.filename or "model.png"

    # 保存到本地
    taskUuid = uuid.uuid4().hex[:8]
    videoLocalPath = os.path.join(UPLOAD_DIR, f"char_video_{taskUuid}_{videoName}")
    with open(videoLocalPath, "wb") as f:
        f.write(videoContent)
    imageLocalPath = os.path.join(UPLOAD_DIR, f"char_image_{taskUuid}_{imageName}")
    with open(imageLocalPath, "wb") as f:
        f.write(imageContent)

    # 分别上传到 RunningHub
    rhVideoFileName = await uploadToRunningHub(videoContent, videoName)
    rhImageFileName = await uploadToRunningHub(imageContent, imageName)

    # 构建节点参数
    nodeInfoList = [
        {
            "nodeId": "63",
            "fieldName": "video",
            "fieldValue": rhVideoFileName,
            "description": "1.参考视频",
        },
        {
            "nodeId": "57",
            "fieldName": "image",
            "fieldValue": rhImageFileName,
            "description": "2.上传图片",
        },
        {
            "nodeId": "217",
            "fieldName": "value",
            "fieldValue": prompt,
            "description": "3.提示词",
        },
        {
            "nodeId": "275",
            "fieldName": "select",
            "fieldValue": replaceType,
            "description": "4.替换类型",
        },
        {
            "nodeId": "194",
            "fieldName": "value",
            "fieldValue": duration,
            "description": "5.视频时长（默认5s）",
        },
    ]

    # NOTE: 角色替换需要 plus 实例（48G 显存）
    taskId = await submitRunningHubApp(CHAR_REPLACE_APP_ID, nodeInfoList, instanceType="plus")

    return QuickAppSubmitResponse(taskId=taskId, creditCost=12)


# ============ 路由：动作迁移 ============


@router.post("/motion-transfer/submit", response_model=QuickAppSubmitResponse)
async def submitMotionTransfer(
    video: UploadFile = File(..., description="要模仿的视频"),
    image: UploadFile = File(..., description="形象人物图片"),
    skipSeconds: str = Form(default="0", description="跳过秒数（从第几秒开始）"),
    totalDuration: str = Form(default="10", description="总时长（建议10秒左右）"),
    resolution: str = Form(default="3", description="分辨率: 3=竖屏720p, 8=横屏720p(经验证)"),
    fps: str = Form(default="30", description="参考视频帧率"),
    ecommerceCoeff: str = Form(default="0.1", description="电商系数（0-1之间）"),
    encryption: str = Form(default="2", description="加密方式: 1=ZIP加密, 2=正常不加密(经验证)"),
    enableFaceMimic: str = Form(default="true", description="人脸表情模仿开关"),
    expressionStrength: str = Form(default="0.8", description="表情强度（0-1之间）"),
    randomSeed: str = Form(default="49", description="随机种子"),
):
    """
    动作迁移 — 让图片中的人物模仿视频中的动作
    NOTE: 参数最多的快捷应用，共 11 个节点
    分辨率和加密方式的枚举值标注「待验证」
    """
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(status_code=500, detail="RUNNINGHUB_API_KEY not configured")

    videoContent = await video.read()
    imageContent = await image.read()
    videoName = video.filename or "reference.mp4"
    imageName = image.filename or "avatar.png"

    # 保存到本地
    taskUuid = uuid.uuid4().hex[:8]
    videoLocalPath = os.path.join(UPLOAD_DIR, f"motion_video_{taskUuid}_{videoName}")
    with open(videoLocalPath, "wb") as f:
        f.write(videoContent)
    imageLocalPath = os.path.join(UPLOAD_DIR, f"motion_image_{taskUuid}_{imageName}")
    with open(imageLocalPath, "wb") as f:
        f.write(imageContent)

    # 分别上传到 RunningHub
    rhVideoFileName = await uploadToRunningHub(videoContent, videoName)
    rhImageFileName = await uploadToRunningHub(imageContent, imageName)

    # 构建节点参数 — 完整的 11 个节点
    nodeInfoList = [
        {
            "nodeId": "225",
            "fieldName": "video",
            "fieldValue": rhVideoFileName,
            "description": "要模仿的视频（最好清晰点）",
        },
        {
            "nodeId": "226",
            "fieldName": "image",
            "fieldValue": rhImageFileName,
            "description": "图片（像素最好高点）",
        },
        {
            "nodeId": "224",
            "fieldName": "value",
            "fieldValue": skipSeconds,
            "description": "跳过秒数（从第几秒开始）",
        },
        {
            "nodeId": "223",
            "fieldName": "value",
            "fieldValue": totalDuration,
            "description": "总时长（建议10秒左右）",
        },
        {
            "nodeId": "383",
            "fieldName": "select",
            "fieldValue": resolution,
            "description": "分辨率（建议720P）",
        },
        {
            "nodeId": "222",
            "fieldName": "value",
            "fieldValue": fps,
            "description": "参考视频帧率",
        },
        {
            "nodeId": "286",
            "fieldName": "value",
            "fieldValue": ecommerceCoeff,
            "description": "电商系数（数值在0-1之间）",
        },
        {
            "nodeId": "362",
            "fieldName": "select",
            "fieldValue": encryption,
            "description": "加密方式（内衣类选zip）",
        },
        {
            "nodeId": "249",
            "fieldName": "value",
            "fieldValue": enableFaceMimic,
            "description": "人脸表情模仿（戴面具和机器人须关闭）",
        },
        {
            "nodeId": "433",
            "fieldName": "value",
            "fieldValue": expressionStrength,
            "description": "表情强度（上面开启才有效，数值0-1之间）",
        },
        {
            "nodeId": "444",
            "fieldName": "value",
            "fieldValue": randomSeed,
            "description": "随机种子（生成效果不满意，就换一个数）",
        },
    ]

    # NOTE: 动作迁移需要 plus 实例（48G 显存）
    taskId = await submitRunningHubApp(MOTION_TRANSFER_APP_ID, nodeInfoList, instanceType="plus")

    return QuickAppSubmitResponse(taskId=taskId, creditCost=15)


# ============ 路由：统一任务状态查询 ============


@router.get("/task/{taskId}", response_model=TaskStatusResponse)
async def getTaskStatus(taskId: str):
    """
    查询快捷应用任务状态
    NOTE: 前端轮询此接口获取任务进度
    当 status=SUCCESS 时，results 包含所有产物的 CDN 链接
    产物可能包含视频(.mp4)、图片(.png)、文本(.txt)等
    """
    result = await queryRunningHubTask(taskId)

    status = result.get("status", "UNKNOWN")
    errorMessage = result.get("errorMessage", "")
    resultUrl = None
    allResults = None

    # NOTE: RunningHub FAILED 响应中，具体错误藏在 failedReason 对象里
    # 顶层 errorMessage 只有泛化的 "工作流运行失败"，不具备诊断价值
    if status == "FAILED":
        failedReason = result.get("failedReason") or {}
        detailedMessage = failedReason.get("exception_message", "")
        exceptionType = failedReason.get("exception_type", "")
        nodeName = failedReason.get("node_name", "")

        if detailedMessage:
            # 优先使用 failedReason 中的详细提示（通常包含用户可操作的建议）
            errorMessage = detailedMessage
        elif exceptionType:
            errorMessage = f"工作流节点 {nodeName} 异常: {exceptionType}"

        logger.warning(
            f"RunningHub task {taskId} FAILED: "
            f"type={exceptionType}, node={nodeName}, "
            f"message={detailedMessage[:200] if detailedMessage else errorMessage}"
        )

    if status == "SUCCESS":
        results = result.get("results", [])
        if results:
            # 优先取视频类型的 URL 作为主结果
            videoResults = [r for r in results if r.get("outputType") in ("mp4", "gif")]
            if videoResults:
                resultUrl = videoResults[0].get("url", "")
            else:
                resultUrl = results[0].get("url", "")

            # 返回所有结果（一键广告视频可能输出视频+图片+文本）
            allResults = [
                {
                    "url": r.get("url", ""),
                    "outputType": r.get("outputType", ""),
                    "text": r.get("text"),
                }
                for r in results
                if r.get("url") or r.get("text")
            ]

    return TaskStatusResponse(
        status=status,
        resultUrl=resultUrl,
        results=allResults,
        errorMessage=errorMessage if errorMessage else None,
    )


# ============ 路由：基础视频生成 (Veo — 暂不可用) ============


@router.get("/models")
async def getAvailableModels():
    """获取可用的视频生成模型列表（保留占位）"""
    return {
        "models": [
            {
                "id": "veo-3.1-generate-preview",
                "name": "Veo 3.1",
                "description": "Google 最先进的视频模型，原生音频，支持 4K",
                "type": "T2V+I2V",
            },
            {
                "id": "veo-3.1-fast-generate-preview",
                "name": "Veo 3.1 Fast",
                "description": "Veo 3.1 快速版本，速度优先",
                "type": "T2V+I2V",
            },
            {
                "id": "veo-2.0-generate-001",
                "name": "Veo 2",
                "description": "上一代稳定模型，成本更低",
                "type": "T2V+I2V",
            },
        ]
    }
