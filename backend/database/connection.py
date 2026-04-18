"""
数据库连接管理

NOTE: 使用 psycopg (v3) + SQLAlchemy 2.x 同步引擎
psycopg3 原生支持中文 Windows 编码，解决 psycopg2 的 GBK 解码崩溃问题
"""
import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# NOTE: 使用 postgresql+psycopg 驱动（psycopg v3），替代 psycopg2
# psycopg v3 在中文 Windows 上不会出现 GBK/UTF-8 编码冲突
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:ROOT@localhost:5432/kunlun")

# NOTE: 将 postgresql:// 前缀替换为 postgresql+psycopg://，显式指定 psycopg3 驱动
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# NOTE: echo=False 生产环境关闭 SQL 日志；pool_pre_ping 自动检测断连
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db():
    """
    FastAPI 依赖注入：提供数据库 Session

    用法：
        @router.get("/users")
        def list_users(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
