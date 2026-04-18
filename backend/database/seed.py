"""
数据库种子数据初始化

NOTE: 应用启动时检查并初始化必要的种子数据：
      - 超级管理员账号
      - 站点配置 (registration_open, maintenance_mode, pricing_config)
      - 工具配置 (11 个工具的积分和开关)
"""
import logging
from sqlalchemy.orm import Session

from database.connection import SessionLocal
from models.user import User
from models.config import SiteConfig, ToolConfig
from auth.security import hashPassword

logger = logging.getLogger(__name__)

# NOTE: 默认工具配置列表
# 积分计算规则：第三方 API 成本 × 1.1 溢价 × 10积分/元 → 取整
DEFAULT_TOOL_CONFIGS = [
    {"tool_id": "video-extractor", "name": "视频链接提取", "credit_cost": 1, "extra_config": {}},
    {"tool_id": "viral-content", "name": "爆款拆解创作", "credit_cost": 1, "extra_config": {"create": 1, "replicate": 12}},
    {"tool_id": "image-generator", "name": "图片生成", "credit_cost": 1, "extra_config": {"product": 1, "model": 1}},
    {"tool_id": "video-generator", "name": "视频生成", "credit_cost": 2, "extra_config": {"upscale": 2, "ad_video": 7, "char_replace": 1, "motion_transfer": 2}},
    {"tool_id": "tts-synthesis", "name": "语音合成", "credit_cost": 1, "extra_config": {"clone": 109}},
    {"tool_id": "watermark-removal", "name": "水印/字幕消除", "credit_cost": 1, "extra_config": {"video_per_sec": 1}},
    {"tool_id": "digital-human", "name": "数字人直播形象", "credit_cost": 11, "extra_config": {}},
    {"tool_id": "music-generator", "name": "AI营销音乐", "credit_cost": 3, "extra_config": {}},
    {"tool_id": "json-prompt-master", "name": "JSON提示词大师", "credit_cost": 1, "extra_config": {}},
    {"tool_id": "knowledge-distill", "name": "知识蒸馏", "credit_cost": 0, "extra_config": {}},
    {"tool_id": "digital-worker", "name": "数字员工", "credit_cost": 1, "extra_config": {}},
]

DEFAULT_SITE_CONFIGS = [
    {"config_key": "registration_open", "config_value": True},
    {"config_key": "maintenance_mode", "config_value": False},
    {"config_key": "pricing_config", "config_value": {
        "plans": [
            {"id": "free", "role": "free", "cycle": "monthly", "price": 0, "credits": 50},
            {"id": "normal_monthly", "role": "normal", "cycle": "monthly", "price": 99, "credits": 1000, "first_bonus": 500},
            {"id": "normal_yearly", "role": "normal", "cycle": "yearly", "price": 79, "credits": 1000, "first_bonus": 500},
            {"id": "pro_monthly", "role": "pro", "cycle": "monthly", "price": 299, "credits": 3000, "first_bonus": 1500},
            {"id": "pro_yearly", "role": "pro", "cycle": "yearly", "price": 249, "credits": 3000, "first_bonus": 1500},
            {"id": "ultra_monthly", "role": "ultra", "cycle": "monthly", "price": 999, "credits": 10000, "first_bonus": 5000},
            {"id": "ultra_yearly", "role": "ultra", "cycle": "yearly", "price": 799, "credits": 10000, "first_bonus": 5000},
        ],
    }},
]


def initSeedData() -> None:
    """
    初始化种子数据

    NOTE: 幂等操作，重复调用不会产生重复数据
    """
    db: Session = SessionLocal()
    try:
        _seedAdminUser(db)
        _seedSiteConfigs(db)
        _seedToolConfigs(db)
        logger.info("Seed data initialization completed")
    except Exception as e:
        logger.error(f"Seed data initialization failed: {e}")
        db.rollback()
    finally:
        db.close()


def _seedAdminUser(db: Session) -> None:
    """创建默认超级管理员（如不存在）"""
    existing = db.query(User).filter(User.username == "admin").first()
    if existing:
        logger.info("Admin user already exists, skipping")
        return

    # NOTE: 测试用户写死创建时间，正式注册用户由注册接口自动记录
    from datetime import datetime, timezone
    seed_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    admin = User(
        username="admin",
        password_hash=hashPassword("admin123"),
        role="super_admin",
        credits=99999,
        created_at=seed_time,
        updated_at=seed_time,
    )
    db.add(admin)
    db.commit()
    logger.info("Created default admin user (username=admin, password=admin123)")


def _seedSiteConfigs(db: Session) -> None:
    """初始化站点配置"""
    for cfg in DEFAULT_SITE_CONFIGS:
        existing = db.query(SiteConfig).filter(SiteConfig.config_key == cfg["config_key"]).first()
        if existing:
            continue
        db.add(SiteConfig(**cfg))
    db.commit()
    logger.info("Site configs seeded")


def _seedToolConfigs(db: Session) -> None:
    """初始化工具配置"""
    for cfg in DEFAULT_TOOL_CONFIGS:
        existing = db.query(ToolConfig).filter(ToolConfig.tool_id == cfg["tool_id"]).first()
        if existing:
            continue
        db.add(ToolConfig(**cfg))
    db.commit()
    logger.info("Tool configs seeded")
