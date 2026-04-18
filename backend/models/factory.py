"""
工厂产物资产 + 工厂使用历史 ORM 模型

NOTE: 用户级隔离，通过 user_id 外键实现多用户数据分离
      替代原 localStorage 的 kunlun_factory_assets_{user} 和 kunlun_factory_history_{user}
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, Integer, Text, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class FactoryAsset(Base):
    """工厂产物资产——每条记录对应一个工厂工具的产出文件"""
    __tablename__ = "factory_assets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    size: Mapped[str] = mapped_column(String(50), nullable=False, default="-")
    download_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tool_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="factory_assets")

    __table_args__ = (
        Index("idx_factory_assets_user_id", "user_id"),
        Index("idx_factory_assets_created_at", "created_at"),
    )


class FactoryHistory(Base):
    """工厂使用历史——记录每次工具调用的操作详情"""
    __tablename__ = "factory_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    duration: Mapped[str | None] = mapped_column(String(50), nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="factory_history")

    __table_args__ = (
        Index("idx_factory_history_user_id", "user_id"),
        Index("idx_factory_history_created_at", "created_at"),
    )
