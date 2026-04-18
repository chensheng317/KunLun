"""
用户自建素材库 + 素材库文件 ORM 模型

NOTE: 文件本体迁移到 TOS 对象存储（Phase 2），数据库只存元数据 + TOS URL
      custom_lib_files 级联删除：删除素材库时自动删除关联文件记录
"""
from datetime import datetime
from sqlalchemy import BigInteger, String, ForeignKey, Index
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class CustomLibrary(Base):
    """用户自建素材库"""
    __tablename__ = "custom_libraries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="custom_libraries")
    files = relationship("CustomLibFile", back_populates="library", cascade="all, delete-orphan", lazy="dynamic")

    __table_args__ = (
        Index("idx_custom_libraries_user_id", "user_id"),
    )


class CustomLibFile(Base):
    """素材库文件元数据"""
    __tablename__ = "custom_lib_files"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # NOTE: ON DELETE CASCADE 确保删除素材库时自动删除文件记录
    library_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("custom_libraries.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[str] = mapped_column(String(50), nullable=False, default="-")
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # NOTE: Phase 2 迁移后此字段存储 TOS 对象存储 URL
    storage_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, nullable=False, default=datetime.utcnow)

    library = relationship("CustomLibrary", back_populates="files")

    __table_args__ = (
        Index("idx_custom_lib_files_library_id", "library_id"),
    )
