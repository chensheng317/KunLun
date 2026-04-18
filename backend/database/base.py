"""
SQLAlchemy 声明基类

NOTE: 所有 ORM 模型都必须继承此 Base，确保 Alembic 能正确发现和管理迁移
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    SQLAlchemy 2.x 风格的声明基类
    所有 models/ 下的 ORM 模型都继承此类
    """
    pass
