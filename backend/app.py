"""
昆仑工坊 — 数字工厂 ASGI 应用定义
NOTE: 整合所有工具服务 + 数字员工 WebSocket 服务 + RESTful API 的 FastAPI 应用
请通过 python main.py 启动服务，不要直接运行此文件
"""

import os

from pathlib import Path

# 在所有模块导入之前加载 .env 文件中的 API Key
# NOTE: 不使用 python-dotenv 库，手动解析以避免额外依赖
_envPath = Path(__file__).parent / ".env"
if _envPath.exists():
    with open(_envPath, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _val = _line.split("=", 1)
                os.environ.setdefault(_key.strip(), _val.strip())

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# --- 工具服务路由（已有） ---
from video_extractor import router as videoExtractRouter
from viral_content import router as viralContentRouter
from image_generator import router as imageGenRouter
from video_generator import router as videoGenRouter
from tts_synthesis import router as ttsSynthesisRouter
from watermark_removal import router as watermarkRemovalRouter
from digital_human import router as digitalHumanRouter
from music_generator import router as musicGenRouter
from json_prompt_master import router as jsonPromptRouter
from digital_worker.router import router as digitalWorkerRouter
from knowledge_distill import router as knowledgeDistillRouter
from lab_knowledge import router as labKnowledgeRouter

# --- RESTful API 路由（新增：数据库驱动） ---
from api.auth import router as apiAuthRouter
from api.users import router as apiUsersRouter
from api.credits import router as apiCreditsRouter
from api.orders import router as apiOrdersRouter
from api.admin import router as apiAdminRouter
from api.assets import router as apiAssetsRouter
from api.config import router as apiConfigRouter
from api.libraries import router as apiLibrariesRouter

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    """
    应用生命周期管理

    NOTE: 启动时初始化数据库种子数据（超级管理员、站点配置、工具配置）
    """
    # 安装日志脱敏过滤器（Phase 2.5）
    from utils.log_filter import installLogFilter
    installLogFilter()

    logger.info("Initializing database seed data...")
    from database.seed import initSeedData
    try:
        initSeedData()
        logger.info("Database seed data ready")
    except Exception as e:
        logger.warning(f"Seed data initialization skipped: {e}")
    yield
    logger.info("Application shutting down")


app = FastAPI(
    title="昆仑工坊 · 数字工厂 API",
    description="KunLun Digital Factory — 工具服务 + RESTful API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 配置：允许前端跨域访问
# NOTE: 生产环境通过 CORS_ORIGINS 环境变量配置（逗号分隔），开发环境默认 localhost
_defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://localhost:3000",
]
_envOrigins = os.environ.get("CORS_ORIGINS", "")
_corsOrigins = [o.strip() for o in _envOrigins.split(",") if o.strip()] if _envOrigins else _defaultOrigins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_corsOrigins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 注册工具服务路由（已有功能） ---
app.include_router(videoExtractRouter)
app.include_router(viralContentRouter)
app.include_router(imageGenRouter)
app.include_router(videoGenRouter)
app.include_router(ttsSynthesisRouter)
app.include_router(watermarkRemovalRouter)
app.include_router(digitalHumanRouter)
app.include_router(musicGenRouter)
app.include_router(jsonPromptRouter)
app.include_router(digitalWorkerRouter)
app.include_router(knowledgeDistillRouter)
app.include_router(labKnowledgeRouter)

# --- 注册 RESTful API 路由（数据库驱动） ---
app.include_router(apiAuthRouter)
app.include_router(apiUsersRouter)
app.include_router(apiCreditsRouter)
app.include_router(apiOrdersRouter)
app.include_router(apiAdminRouter)
app.include_router(apiAssetsRouter)
app.include_router(apiConfigRouter)
app.include_router(apiLibrariesRouter)


@app.get("/")
async def root():
    """健康检查接口"""
    return {
        "service": "昆仑工坊 · 数字工厂",
        "version": "2.0.0",
        "status": "online",
        "tools": [
            "视频链接提取",
            "爆款拆解/创作",
            "图片生成 (RunningHub API)",
            "视频生成 (RunningHub API)",
            "语音合成",
            "水印/字幕消除",
            "数字员工",
            "知识蒸馏（实验室）",
        ],
        "api": [
            "/api/auth — 认证",
            "/api/users — 用户管理",
            "/api/credits — 积分管理",
            "/api/orders — 订单管理",
            "/api/admin — 管理后台",
            "/api/assets — 资产管理",
            "/api/config — 配置管理",
            "/api/libraries — 自建素材库",
        ],
    }


@app.get("/health")
async def healthCheck():
    """服务健康检查"""
    return {"status": "healthy"}
