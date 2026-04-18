"""
知识库服务 — 实验室知识蒸馏的独立存储
NOTE: 独立于资产库和历史记录，专门存放蒸馏出来的知识文档
存储方式：JSON 文件，每条记录包含元数据 + 文档内容
"""

import os
import json
import uuid
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lab/knowledge", tags=["知识库"])

# 知识库存储目录
_KNOWLEDGE_DIR = Path(__file__).parent / "data" / "lab_knowledge"
_KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)


# ==================== 数据模型 ====================

class KnowledgeDocInput(BaseModel):
    """保存到知识库的单篇文档"""
    title: str = Field(..., description="文档标题")
    summary: str = Field(..., description="摘要")
    content: str = Field(..., description="完整内容（含图片 markdown）")
    tags: list[str] = Field(default_factory=list, description="标签")
    sourceQuotes: list[str] = Field(default_factory=list, description="原文金句")
    sourceTitle: str = Field(default="", description="原文标题")
    sourceAuthor: str = Field(default="", description="原文作者")
    sourceUrl: str = Field(default="", description="原文链接")


class KnowledgeDocRecord(BaseModel):
    """知识库中的完整记录"""
    id: str
    title: str
    summary: str
    content: str
    tags: list[str]
    sourceQuotes: list[str]
    sourceTitle: str
    sourceAuthor: str
    sourceUrl: str
    createdAt: str
    updatedAt: str


class KnowledgeListItem(BaseModel):
    """列表项（不含完整 content，减少传输量）"""
    id: str
    title: str
    summary: str
    tags: list[str]
    sourceTitle: str
    sourceAuthor: str
    createdAt: str


# ==================== 存储操作 ====================

def _getRecordPath(recordId: str) -> Path:
    """获取记录文件路径，防止路径遍历"""
    safeName = recordId.replace("/", "").replace("\\", "").replace("..", "")
    return _KNOWLEDGE_DIR / f"{safeName}.json"


def _loadRecord(recordId: str) -> dict | None:
    """加载单条记录"""
    path = _getRecordPath(recordId)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to load knowledge record {recordId}: {e}")
        return None


def _saveRecord(recordId: str, data: dict) -> None:
    """保存单条记录"""
    path = _getRecordPath(recordId)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _deleteRecord(recordId: str) -> bool:
    """删除单条记录"""
    path = _getRecordPath(recordId)
    if path.exists():
        path.unlink()
        return True
    return False


def _listAllRecords() -> list[dict]:
    """列出所有记录（按时间倒序）"""
    records = []
    for filePath in _KNOWLEDGE_DIR.glob("*.json"):
        try:
            with open(filePath, "r", encoding="utf-8") as f:
                data = json.load(f)
                records.append(data)
        except (json.JSONDecodeError, OSError):
            continue
    # 按创建时间倒序排列
    records.sort(key=lambda r: r.get("createdAt", ""), reverse=True)
    return records


# ==================== API 接口 ====================

@router.get("")
async def listKnowledge():
    """
    获取知识库列表（不含完整 content 以减少传输量）
    """
    records = _listAllRecords()
    items = []
    for r in records:
        items.append(KnowledgeListItem(
            id=r["id"],
            title=r["title"],
            summary=r["summary"],
            tags=r.get("tags", []),
            sourceTitle=r.get("sourceTitle", ""),
            sourceAuthor=r.get("sourceAuthor", ""),
            createdAt=r.get("createdAt", ""),
        ))
    return {"items": items, "total": len(items)}


@router.get("/{recordId}")
async def getKnowledge(recordId: str):
    """获取单条知识文档完整内容"""
    data = _loadRecord(recordId)
    if not data:
        raise HTTPException(status_code=404, detail="知识文档不存在")
    return data


@router.post("")
async def saveKnowledge(doc: KnowledgeDocInput):
    """
    保存一篇知识文档到知识库
    NOTE: 可以从蒸馏结果中单篇保存，也可以批量保存
    """
    recordId = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()

    record = {
        "id": recordId,
        "title": doc.title,
        "summary": doc.summary,
        "content": doc.content,
        "tags": doc.tags,
        "sourceQuotes": doc.sourceQuotes,
        "sourceTitle": doc.sourceTitle,
        "sourceAuthor": doc.sourceAuthor,
        "sourceUrl": doc.sourceUrl,
        "createdAt": now,
        "updatedAt": now,
    }

    _saveRecord(recordId, record)
    logger.info(f"Knowledge saved: id={recordId}, title='{doc.title}'")
    return record


@router.post("/batch")
async def saveKnowledgeBatch(docs: list[KnowledgeDocInput]):
    """
    批量保存多篇知识文档（蒸馏结果一键保存全部）
    """
    now = datetime.now().isoformat()
    saved = []

    for doc in docs:
        recordId = str(uuid.uuid4())[:8]
        record = {
            "id": recordId,
            "title": doc.title,
            "summary": doc.summary,
            "content": doc.content,
            "tags": doc.tags,
            "sourceQuotes": doc.sourceQuotes,
            "sourceTitle": doc.sourceTitle,
            "sourceAuthor": doc.sourceAuthor,
            "sourceUrl": doc.sourceUrl,
            "createdAt": now,
            "updatedAt": now,
        }
        _saveRecord(recordId, record)
        saved.append(record)

    logger.info(f"Knowledge batch saved: {len(saved)} documents")
    return {"saved": saved, "total": len(saved)}


@router.delete("/{recordId}")
async def deleteKnowledge(recordId: str):
    """删除一篇知识文档"""
    if not _deleteRecord(recordId):
        raise HTTPException(status_code=404, detail="知识文档不存在")
    logger.info(f"Knowledge deleted: id={recordId}")
    return {"success": True, "id": recordId}
