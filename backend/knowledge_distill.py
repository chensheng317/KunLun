"""
知识蒸馏服务
NOTE: 将微信公众号文章智能蒸馏为多篇结构化知识文档
核心原则：保留原文作者的原创表述，AI 只做结构化整理，不改写行业经验原话

流程：
1. 抓取公众号文章 HTML
2. 解析提取正文（去除导航、关注引导、广告等非内容元素）
3. 调用 AutoGLM (GLM) API 进行智能分析和主题拆分
4. 返回蒸馏后的知识文档数组
"""

import os
import re
import json
import logging
from html import unescape
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lab/distill", tags=["知识蒸馏"])

# ==================== AutoGLM / GLM API 配置 ====================

AUTOGLM_BASE_URL = os.getenv("AUTOGLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
AUTOGLM_API_KEY = os.getenv("AUTOGLM_API_KEY", "")
# NOTE: 蒸馏使用 glm-4-flash 模型 — 长文本支持好、速度快、成本低
DISTILL_MODEL = "glm-4-flash"


# ==================== 请求/响应模型 ====================

class DistillRequest(BaseModel):
    """蒸馏请求"""
    url: str = Field(..., description="微信公众号文章 URL")


class KnowledgeDocument(BaseModel):
    """单篇蒸馏知识文档"""
    id: str = Field(..., description="文档 ID")
    title: str = Field(..., description="知识文档标题")
    summary: str = Field(..., description="核心摘要（1-2句话）")
    content: str = Field(..., description="完整知识内容（保留原文原句，图片以 markdown 语法 ![描述](url) 嵌入）")
    tags: list[str] = Field(default_factory=list, description="知识标签")
    sourceQuotes: list[str] = Field(default_factory=list, description="保留的原文金句")


class DistillResponse(BaseModel):
    """蒸馏响应"""
    articleTitle: str = Field(..., description="原文标题")
    articleAuthor: str = Field(default="", description="公众号名称")
    documents: list[KnowledgeDocument] = Field(default_factory=list, description="蒸馏后的知识文档")
    totalDocuments: int = Field(default=0, description="文档总数")
    images: list[str] = Field(default_factory=list, description="文章中提取的所有图片 URL")


# ==================== 文章抓取与解析 ====================

# NOTE: 模拟浏览器 UA，避免被微信服务器拦截
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def _extractArticleContent(html: str) -> dict[str, str]:
    """
    从微信公众号文章 HTML 中提取正文、标题、作者
    NOTE: 微信公众号文章结构相对固定：
    - 标题在 <h1 class="rich_media_title"> 中
    - 作者在 <span class="rich_media_meta_nickname"> 或 js 变量中
    - 正文在 <div id="js_content"> 中
    """
    result: dict[str, str] = {"title": "", "author": "", "content": ""}

    # 提取标题
    titleMatch = re.search(
        r'<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>(.*?)</h1>',
        html,
        re.DOTALL,
    )
    if titleMatch:
        result["title"] = re.sub(r"<[^>]+>", "", titleMatch.group(1)).strip()
    else:
        # 降级：从 <title> 标签提取
        titleFallback = re.search(r"<title>(.*?)</title>", html, re.DOTALL)
        if titleFallback:
            result["title"] = titleFallback.group(1).strip()

    # 提取作者/公众号名称
    authorMatch = re.search(
        r'var\s+nickname\s*=\s*["\']([^"\']+)["\']',
        html,
    )
    if authorMatch:
        result["author"] = authorMatch.group(1).strip()
    else:
        nickMatch = re.search(
            r'<span[^>]*class="[^"]*rich_media_meta_nickname[^"]*"[^>]*>(.*?)</span>',
            html,
            re.DOTALL,
        )
        if nickMatch:
            result["author"] = re.sub(r"<[^>]+>", "", nickMatch.group(1)).strip()

    # 提取正文内容
    contentMatch = re.search(
        r'<div[^>]*id="js_content"[^>]*>(.*?)</div>\s*(?:<div|<script)',
        html,
        re.DOTALL,
    )
    if contentMatch:
        rawContent = contentMatch.group(1)
    else:
        # 降级：尝试提取整个 rich_media_content
        contentFallback = re.search(
            r'<div[^>]*class="[^"]*rich_media_content[^"]*"[^>]*>(.*?)</div>',
            html,
            re.DOTALL,
        )
        rawContent = contentFallback.group(1) if contentFallback else ""

    if rawContent:
        # --- 图片提取 ---
        # NOTE: 微信公众号图片使用 data-src 属性（懒加载），优先提取 data-src，降级到 src
        # 在 strip HTML 之前将 <img> 转为 markdown 图片语法，避免图片信息丢失
        imageUrls: list[str] = []

        def _replaceImg(match: re.Match) -> str:
            """
            将 <img> 标签替换为 markdown 图片语法
            NOTE: 微信 CDN 图片(mmbiz.qpic.cn)通常可直接访问，无需代理
            过滤掉常见的非内容图片（表情包、装饰图标等小于100px的图片）
            """
            tag = match.group(0)
            # 优先 data-src（微信懒加载），降级到 src
            urlMatch = re.search(r'data-src=["\']([^"\']+)["\']', tag)
            if not urlMatch:
                urlMatch = re.search(r'src=["\']([^"\']+)["\']', tag)
            if not urlMatch:
                return ""

            imgUrl = urlMatch.group(1)

            # 过滤非内容图片：data URI、空白图、微信表情等
            if imgUrl.startswith("data:") or "res.wx.qq.com" in imgUrl:
                return ""
            # 过滤极小的装饰图标（通过 width 属性判断）
            widthMatch = re.search(r'(?:data-w|width)=["\']?(\d+)', tag)
            if widthMatch and int(widthMatch.group(1)) < 80:
                return ""

            imageUrls.append(imgUrl)
            # 尝试提取 alt 描述
            altMatch = re.search(r'alt=["\']([^"\']*)["\']', tag)
            altText = altMatch.group(1).strip() if altMatch and altMatch.group(1).strip() else "图片"
            return f"\n![{altText}]({imgUrl})\n"

        rawContent = re.sub(r"<img[^>]*/?>", _replaceImg, rawContent, flags=re.IGNORECASE)

        # 清理 HTML 标签，保留段落结构
        # 将 <br> / <p> / <section> 转为换行
        text = re.sub(r"<br\s*/?>", "\n", rawContent, flags=re.IGNORECASE)
        text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</section>", "\n", text, flags=re.IGNORECASE)
        # 移除所有 HTML 标签（图片已转为 markdown 语法，不会被误删）
        text = re.sub(r"<[^>]+>", "", text)
        # 解码 HTML 实体
        text = unescape(text)
        # 清理多余空行（保留最多两个连续换行）
        text = re.sub(r"\n{3,}", "\n\n", text)
        # 清理行首尾空白
        text = "\n".join(line.strip() for line in text.split("\n"))
        text = text.strip()
        result["content"] = text
        result["images"] = imageUrls

    return result


# ==================== GLM API 调用 ====================

# NOTE: 蒸馏 Prompt 的核心设计原则：
# 1. 尽最大可能保留原文原句 — 这些是行业一线宝贵经验
# 2. AI 只做结构化整理：主题识别、拆分、格式统一
# 3. 去除广告、引流、无关修饰语等非知识内容
# 4. 宁可少拆不过拆 — 每篇文档必须有足够的信息密度

_DISTILL_SYSTEM_PROMPT = """你是一位专业的知识架构师。你的任务是将一篇文章"蒸馏"为少量高质量的知识文档，你必须严格输出 JSON 格式。

## 核心原则（必须严格遵守）

1. **保留原文原句**：文章作者的原创表述是行业一线的宝贵经验，你**绝对不能**改写、润色或重新表述这些内容。你只能原封不动地引用。

2. **图片占位符必须保留**：
   - 原文中的图片已被替换为 `[IMG_1]`、`[IMG_2]` 等占位符
   - 你**必须在 content 字段中原样保留**这些占位符
   - 每个占位符独占一行
   - 只删除你认为是二维码/公众号名片的图片占位符

3. **你的工作范围**：
   - 识别文章中的独立知识主题，将相关段落归在一起
   - 为每篇文档提炼标题和摘要
   - 统一格式（如列表、标点等表面格式）
   - 原样保留 [IMG_N] 图片占位符
   - 不得改写作者的原创观点、经验、方法论表述
   - 不得添加你自己的解释或总结来替代原文

4. **必须删除的非知识内容**：
   - 公众号关注引导（如"点击关注"、"点击名片"、"长按识别二维码"）
   - 广告、引流、推广语句（如"领取资料"、"加入社群"、"扫码"）
   - 文章末尾的运营大纲、课程目录、平台功能索引等自我宣传内容
   - emoji 开头的 CTA 引导语（如"..."后接推广）
   - 任何与文章核心知识无关的营销内容

5. **拆分策略（宁可少拆绝不过拆）**：
   - 每篇知识文档的 content 字段必须至少包含 **200字以上**的实质内容
   - 如果某个知识点原文只有1-3句话，**不要**单独成篇，应该和相近的知识点**合并**
   - 拆分的粒度参考：
     - 文章总字数 < 1000字：只输出 **1篇** 文档
     - 文章总字数 1000-3000字：输出 **1-2篇** 文档
     - 文章总字数 3000-8000字：输出 **2-3篇** 文档
     - 文章总字数 > 8000字：输出 **3-5篇** 文档（最多不超过5篇）
   - 如果文章末尾只是广告/推广/运营大纲，**不要**将其作为单独的知识文档

## 输出格式

你必须严格输出以下 JSON 格式，直接输出 JSON 对象，不要包裹在代码块中：

{
  "documents": [
    {
      "title": "知识文档标题",
      "summary": "1-2句话的核心摘要",
      "content": "完整的知识内容。\\n\\n[IMG_1]\\n\\n继续后面的文字...",
      "tags": ["标签1", "标签2", "标签3"],
      "sourceQuotes": ["原文中最有价值的1-3句金句"]
    }
  ]
}"""

_DISTILL_USER_PROMPT = """请将以下文章蒸馏为知识文档。

文章标题：{title}
作者/来源：{author}

--- 正文开始 ---
{content}
--- 正文结束 ---

请严格按照 JSON 格式输出蒸馏结果。关键强调：
1. 保留原文原句，不改写
2. 保留所有 [IMG_N] 图片占位符
3. 每篇文档的 content 至少 200 字
4. 宁可少拆不过拆
5. 彻底删除广告和推广内容"""


def _repairTruncatedJson(jsonStr: str) -> dict | None:
    """
    尝试修复被截断的 JSON（GLM 输出 token 达上限时会发生）
    策略：找到最后一个完整的文档对象（以 } 结尾），截断后面不完整的部分，补全 JSON 结构
    """
    # 找到 "documents": [ 的位置
    arrStart = jsonStr.find('"documents"')
    if arrStart < 0:
        return None

    bracketPos = jsonStr.find("[", arrStart)
    if bracketPos < 0:
        return None

    # 从数组开始位置开始，逐步寻找最后一个完整的 document 对象
    # 完整对象的标志是 "sourceQuotes": [...] 后跟 }
    lastCompleteEnd = -1
    searchFrom = bracketPos + 1

    while True:
        # 找下一个 "sourceQuotes" 字段
        sqPos = jsonStr.find('"sourceQuotes"', searchFrom)
        if sqPos < 0:
            break

        # 找到 sourceQuotes 数组的闭合 ]
        closeBracket = jsonStr.find("]", sqPos)
        if closeBracket < 0:
            break

        # 找到文档对象的闭合 }
        closeBrace = jsonStr.find("}", closeBracket)
        if closeBrace < 0:
            break

        lastCompleteEnd = closeBrace + 1
        searchFrom = closeBrace + 1

    if lastCompleteEnd <= 0:
        return None

    # 截取到最后一个完整文档，补全 JSON
    repairedStr = jsonStr[:lastCompleteEnd] + "]}"

    try:
        result = json.loads(repairedStr)
        return result
    except json.JSONDecodeError:
        return None

async def _callGlmApi(articleTitle: str, articleAuthor: str, articleContent: str) -> list[dict]:
    """
    调用 GLM API 进行文章蒸馏
    NOTE: 使用 glm-4-flash 模型，支持 128K 上下文，适合长文章处理

    图片处理策略：
    1. 输入预处理：![desc](url) → [IMG_N] 占位符（节省输出 token）
    2. 输出后处理：[IMG_N] → ![图片](url) 还原完整图片标记
    """
    if not AUTOGLM_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="AutoGLM API Key 未配置，请在 .env 中设置 AUTOGLM_API_KEY",
        )

    # ---- 图片占位符预处理 ----
    # 将 ![desc](url) 替换为 [IMG_1]、[IMG_2] 等短占位符
    # NOTE: 这是解决 GLM 输出 token 截断的关键优化
    # glm-4-flash 最大输出 4096 tokens，长 URL 会吃掉大量 token
    imgPattern = re.compile(r'!\[[^\]]*\]\([^)]+\)')
    imgMatches = imgPattern.findall(articleContent)
    imgMap: dict[str, str] = {}  # {占位符: 原始图片标记}

    processedContent = articleContent
    for idx, match in enumerate(imgMatches, 1):
        placeholder = f"[IMG_{idx}]"
        imgMap[placeholder] = match
        processedContent = processedContent.replace(match, placeholder, 1)

    logger.info(
        f"Image placeholder: {len(imgMap)} images replaced, "
        f"content reduced from {len(articleContent)} to {len(processedContent)} chars"
    )

    # 如果正文太长，截断到合理长度（预留 prompt 和输出 token 空间）
    maxContentLen = 60000
    truncatedContent = processedContent[:maxContentLen]
    if len(processedContent) > maxContentLen:
        truncatedContent += "\n\n[... 原文过长，已截断 ...]"
        logger.warning(
            f"Article content truncated: {len(processedContent)} -> {maxContentLen} chars"
        )

    userPrompt = _DISTILL_USER_PROMPT.format(
        title=articleTitle or "未知标题",
        author=articleAuthor or "未知来源",
        content=truncatedContent,
    )

    payload = {
        "model": DISTILL_MODEL,
        "messages": [
            {"role": "system", "content": _DISTILL_SYSTEM_PROMPT},
            {"role": "user", "content": userPrompt},
        ],
        "temperature": 0.3,
        "top_p": 0.7,
        "max_tokens": 4096,
        # NOTE: 强制 GLM 返回纯 JSON 对象，不会再包裹 ```json ``` 标记
        # 这是解决 "无法解析为 JSON" 的关键参数
        "response_format": {"type": "json_object"},
    }

    logger.info(
        f"Calling GLM API for distillation: model={DISTILL_MODEL}, "
        f"content_len={len(truncatedContent)}"
    )

    # NOTE: 长文章 + 图片链接保留时，GLM 生成时间可能超过 2 分钟
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(
            f"{AUTOGLM_BASE_URL}/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {AUTOGLM_API_KEY}",
            },
            json=payload,
        )

    if resp.status_code != 200:
        logger.error(f"GLM API error: {resp.status_code} {resp.text[:500]}")
        raise HTTPException(
            status_code=502,
            detail=f"GLM API 调用失败: HTTP {resp.status_code}",
        )

    data = resp.json()

    # 检查 finish_reason，帮助诊断截断问题
    finishReason = data.get("choices", [{}])[0].get("finish_reason", "unknown")
    if finishReason != "stop":
        logger.warning(f"GLM finish_reason={finishReason} (expected 'stop'), output may be truncated")

    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

    if not content:
        raise HTTPException(status_code=502, detail="GLM API 返回内容为空")

    # 解析 JSON 响应
    # NOTE: 设置了 response_format=json_object 后，GLM 直接返回纯 JSON
    # 保留 ```json ``` 清理作为 fallback 兼容
    jsonStr = content.strip()
    if jsonStr.startswith("```"):
        jsonStr = re.sub(r"^```(?:json)?\s*", "", jsonStr)
        jsonStr = re.sub(r"\s*```$", "", jsonStr)

    try:
        parsed = json.loads(jsonStr)
    except json.JSONDecodeError as e:
        # NOTE: GLM 输出 token 达到上限时 JSON 会被截断
        # 尝试修复：找到最后一个完整的文档对象，补全 JSON 结构
        logger.warning(f"JSON parse failed, attempting truncation repair: {e}")
        repaired = _repairTruncatedJson(jsonStr)
        if repaired is not None:
            parsed = repaired
            logger.info(f"JSON repair succeeded, recovered {len(parsed.get('documents', []))} documents")
        else:
            logger.error(f"JSON repair failed. Content: {content[:500]}")
            raise HTTPException(
                status_code=502,
                detail="GLM API 返回格式异常，无法解析为 JSON",
            )

    documents = parsed.get("documents", [])
    if not isinstance(documents, list):
        raise HTTPException(status_code=502, detail="GLM API 返回的 documents 格式异常")

    # ---- 图片占位符后处理：还原 [IMG_N] → 原始图片标记 ----
    if imgMap:
        for doc in documents:
            docContent = doc.get("content", "")
            for placeholder, originalImg in imgMap.items():
                docContent = docContent.replace(placeholder, originalImg)
            doc["content"] = docContent
        logger.info(f"Image placeholders restored in {len(documents)} documents")

    logger.info(f"Distillation complete: {len(documents)} documents generated")
    return documents


# ==================== API 接口 ====================

@router.post("", response_model=DistillResponse)
async def distillArticle(req: DistillRequest):
    """
    知识蒸馏 — 将微信公众号文章蒸馏为多篇知识文档
    NOTE: 完整流程 = 抓取文章 → 解析正文 → GLM 蒸馏 → 返回结构化文档
    """
    url = req.url.strip()

    # 基本 URL 校验
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="请输入有效的文章链接（以 http 开头）")

    # ---- 步骤1: 抓取文章 ----
    logger.info(f"Fetching article: {url}")
    try:
        async with httpx.AsyncClient(
            timeout=30,
            follow_redirects=True,
            headers=_HEADERS,
        ) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        raise HTTPException(status_code=408, detail="抓取文章超时，请检查链接是否可访问")
    except Exception as e:
        logger.error(f"Failed to fetch article: {e}")
        raise HTTPException(status_code=502, detail=f"抓取文章失败: {str(e)}")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"文章页面返回 HTTP {resp.status_code}，请确认链接有效",
        )

    html = resp.text

    # ---- 步骤2: 解析提取正文 ----
    extracted = _extractArticleContent(html)
    articleTitle = extracted["title"]
    articleAuthor = extracted["author"]
    articleContent = extracted["content"]

    if not articleContent or len(articleContent) < 50:
        raise HTTPException(
            status_code=422,
            detail="未能从页面提取到有效正文内容，请确认链接为公开的文章页面",
        )

    # 提取的图片列表
    articleImages: list[str] = extracted.get("images", [])

    logger.info(
        f"Extracted article: title='{articleTitle}', author='{articleAuthor}', "
        f"content_len={len(articleContent)}, images={len(articleImages)}"
    )

    # ---- 步骤3: 调用 GLM API 蒸馏 ----
    rawDocuments = await _callGlmApi(articleTitle, articleAuthor, articleContent)

    # ---- 步骤4: 格式化输出 ----
    documents = []
    for i, doc in enumerate(rawDocuments):
        documents.append(
            KnowledgeDocument(
                id=f"doc-{i + 1}",
                title=doc.get("title", f"知识文档 {i + 1}"),
                summary=doc.get("summary", ""),
                content=doc.get("content", ""),
                tags=doc.get("tags", []),
                sourceQuotes=doc.get("sourceQuotes", []),
            )
        )

    return DistillResponse(
        articleTitle=articleTitle,
        articleAuthor=articleAuthor,
        documents=documents,
        totalDocuments=len(documents),
        images=articleImages,
    )
