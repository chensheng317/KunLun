"""
视频链接提取服务

NOTE: 支持抖音、小红书、快手、B站四大平台的无水印视频源链接和封面提取。
每个平台采用多策略 fallback（自主解析 → 公共 API → yt-dlp）。
"""

import re
import os
import uuid
import shutil
import asyncio
import subprocess
import logging
import socket
from typing import Optional
from pathlib import Path
from urllib.parse import quote, urljoin

try:
    import yt_dlp
    HAS_YTDLP = True
except ImportError:
    HAS_YTDLP = False

try:
    import json_repair
except ImportError:
    import json as json_repair

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ================================================================
#  全局配置
# ================================================================

# NOTE: Clash TUN fake-ip 仅代理 IPv4，强制跳过 IPv6 避免超时
_orig_getaddrinfo = socket.getaddrinfo
socket.getaddrinfo = lambda *a, **kw: _orig_getaddrinfo(
    a[0], a[1], socket.AF_INET, *a[3:], **kw
)

router = APIRouter(prefix="/api/video-extract", tags=["视频链接提取"])
CREDIT_COST = 5

# ffmpeg — B站 DASH 音视频合并需要
FFMPEG = shutil.which("ffmpeg")
if not FFMPEG:
    try:
        import imageio_ffmpeg  # type: ignore[import-not-found]
        FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass

MERGED_DIR = Path(__file__).parent / "outputs" / "merged"
MERGED_DIR.mkdir(parents=True, exist_ok=True)

# 平台识别正则
PLATFORM_RE = {
    "douyin": r"douyin\.com|iesdouyin\.com",
    "xiaohongshu": r"xiaohongshu\.com|xhslink\.com",
    "kuaishou": r"kuaishou\.com|chenzhongtech\.com|kwai\.com",
    "bilibili": r"bilibili\.com|b23\.tv",
}

# 各场景请求头
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
)
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
)


# ================================================================
#  Pydantic 模型
# ================================================================

class VideoExtractRequest(BaseModel):
    """视频提取请求"""
    url: str = Field(..., description="视频平台分享链接")


class VideoExtractResponse(BaseModel):
    """视频提取响应"""
    platform: str
    title: str = ""
    videoUrl: str = ""
    coverUrl: str = ""
    author: str = ""
    creditCost: int = CREDIT_COST
    # NOTE: 小红书图文笔记可能有多张图片
    images: list[str] = []
    contentType: str = "video"  # "video" | "image"


# ================================================================
#  通用工具
# ================================================================

def _extractUrl(text: str) -> str:
    """从分享文本中提取纯 URL（用户粘贴的分享内容常混有描述文字）"""
    m = re.search(r"https?://\S+", text)
    return m.group(0).rstrip("，。！？》」】）") if m else text.strip()


def _detectPlatform(url: str) -> Optional[str]:
    """根据 URL 识别平台"""
    for name, pattern in PLATFORM_RE.items():
        if re.search(pattern, url, re.I):
            return name
    return None


def _searchDict(data, key: str) -> list:
    """递归搜索 dict/list 中指定 key 的所有值"""
    results = []
    if isinstance(data, dict):
        for k, v in data.items():
            if k == key:
                results.append(v)
            results.extend(_searchDict(v, key))
    elif isinstance(data, list):
        for item in data:
            results.extend(_searchDict(item, key))
    return results


async def _resolveRedirects(url: str, headers: dict = None) -> str:
    """跟踪短链 302 重定向，返回最终 URL"""
    cur = url
    hdrs = headers or {"User-Agent": UA}
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=15) as c:
            for _ in range(5):
                r = await c.get(cur, headers=hdrs)
                loc = r.headers.get("location", "")
                if r.status_code in (301, 302, 303, 307) and loc:
                    cur = loc if loc.startswith("http") else urljoin(cur, loc)
                else:
                    break
    except Exception:
        pass
    return cur


def _metaContent(html: str, name: str) -> str:
    """从 HTML 提取 og:xxx / twitter:xxx 等 meta 标签的 content"""
    for pat in [
        rf'<meta\s+(?:property|name)="{re.escape(name)}"\s+content="([^"]+)"',
        rf'<meta\s+content="([^"]+)"\s+(?:property|name)="{re.escape(name)}"',
    ]:
        m = re.search(pat, html, re.I)
        if m:
            return m.group(1)
    return ""


async def _ytdlpInfo(url: str) -> Optional[dict]:
    """在线程池中运行 yt-dlp 提取视频元信息（不下载）"""
    if not HAS_YTDLP:
        return None
    opts = {
        "skip_download": True, "quiet": True, "no_warnings": True,
        "socket_timeout": 15, "nocheckcertificate": True,
    }

    def _run():
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    return await asyncio.get_event_loop().run_in_executor(None, _run)


def _bestFormat(formats: list, *, video: bool = True) -> str:
    """从 yt-dlp formats 列表中挑选最高画质的视频 URL"""
    items = [
        f for f in formats
        if f.get("url") and (
            f.get("vcodec", "none") != "none" if video
            else f.get("acodec", "none") != "none"
        )
    ]
    items.sort(
        key=lambda f: (
            f.get("width", 0) * f.get("height", 0),
            f.get("filesize", 0) or f.get("filesize_approx", 0) or 0,
        ),
        reverse=True,
    )
    return items[0]["url"] if items else ""


def _result(platform: str, **kw) -> dict:
    """统一构造返回结果"""
    return {"platform": platform, "creditCost": CREDIT_COST, **kw}


# ================================================================
#  抖音提取
#  策略一: iesdouyin 分享页解析 _ROUTER_DATA（1080p 无水印直链）
#  策略二: bugpk 公共 API fallback
# ================================================================

_ROUTER_DATA_RE = re.compile(r"window\._ROUTER_DATA\s*=\s*(.*?)</script>", re.S | re.I)


async def _extractDouyin(url: str) -> dict:
    title = cover = author = video = ""
    all_images: list[str] = []  # NOTE: 抖音图文帖的全部图片

    # --- 策略一：自主解析 _ROUTER_DATA ---
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            # 短链 → 获取 video ID
            r = await c.get(url, headers={"User-Agent": MOBILE_UA}, follow_redirects=False)
            loc = r.headers.get("Location", "")
            if not loc:
                r = await c.get(url, headers={"User-Agent": MOBILE_UA}, follow_redirects=True)
                loc = str(r.url)

            vid = re.search(r"\d+", loc)
            if vid:
                vid = vid.group(0)
                resp = await c.get(
                    f"https://www.iesdouyin.com/share/video/{vid}",
                    headers={"User-Agent": MOBILE_UA}, follow_redirects=True,
                )
                html = resp.text
                m = _ROUTER_DATA_RE.search(html)
                if m:
                    raw = m.group(1).strip().rstrip("; \n\r\t")
                    idx = raw.find("{")
                    if idx > 0:
                        raw = raw[idx:]
                    data = json_repair.loads(raw)

                    # 数据路径: loaderData → video_(id)/page → videoInfoRes → item_list[0]
                    items = (
                        data.get("loaderData", {})
                        .get("video_(id)/page", {})
                        .get("videoInfoRes", {})
                        .get("item_list", [])
                    )
                    detail = items[0] if isinstance(items, list) and items else {}

                    if detail:
                        uri = detail.get("video", {}).get("play_addr", {}).get("uri", "")
                        if uri:
                            video = f"http://www.iesdouyin.com/aweme/v1/play/?video_id={uri}&ratio=1080p&line=0"
                        title = detail.get("desc", "")
                        covers = detail.get("video", {}).get("cover", {}).get("url_list", [])
                        cover = covers[0] if covers else ""
                        author = detail.get("author", {}).get("nickname", "")

                        # NOTE: 抖音图文帖没有 video.play_addr.uri，图片在 images 数组中
                        # 每个 image 对象有 url_list，取第一个（通常是最高清无水印版本）
                        if not video:
                            img_list = detail.get("images", [])
                            if not img_list:
                                # 部分版本路径为 image_post_info.images
                                img_list = detail.get("image_post_info", {}).get("images", [])
                            for img_item in (img_list or []):
                                if isinstance(img_item, dict):
                                    urls = img_item.get("url_list", [])
                                    # 优先选择 download_url_list（无水印高清）
                                    download_urls = img_item.get("download_url_list", [])
                                    chosen = (download_urls or urls)
                                    if chosen:
                                        # NOTE: 通过后端代理下载，绕过抖音 CDN 防盗链
                                        raw_url = chosen[0]
                                        proxy_url = f"/api/video-extract/proxy?url={quote(raw_url, safe='')}"
                                        all_images.append(proxy_url)
                            # 图文封面取第一张图片的原始 URL（用于缩略图预览）
                            if all_images and not cover:
                                # 用 url_list 中的 URL 做封面预览（非代理，直接展示）
                                first_img = (img_list or [{}])[0]
                                preview_urls = first_img.get("url_list", [])
                                cover = preview_urls[0] if preview_urls else ""
                            if all_images:
                                logger.info("Douyin image-text post: found %d images", len(all_images))
    except Exception as e:
        logger.warning(f"Douyin _ROUTER_DATA failed: {e}")

    if video:
        # NOTE: iesdouyin CDN 有防盗链，前端直接 fetch 会 403，需通过后端 proxy 中转
        proxy_video = f"/api/video-extract/proxy?url={quote(video, safe='')}"
        return _result("douyin", title=title or "抖音视频", videoUrl=proxy_video, coverUrl=cover, author=author)

    # NOTE: 图文帖检查 — 有图片但无视频，直接返回图文结果
    if all_images:
        return _result(
            "douyin",
            title=title or "抖音图文",
            videoUrl="",
            coverUrl=cover,
            author=author,
            images=all_images,
            contentType="image",
        )

    # --- 策略二：bugpk API ---
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get("https://api.bugpk.com/api/dyjx", params={"url": url})
            d = r.json()
            if d.get("code") == 200 and d.get("data"):
                dd = d["data"]
                video = dd.get("url", "")
                cover = cover or dd.get("cover", "")
                title = title or dd.get("title", "")
                author = author or dd.get("author", "")
    except Exception as e:
        logger.warning(f"Douyin bugpk API failed: {e}")

    # bugpk 返回的 URL 同样需要代理
    if video:
        video = f"/api/video-extract/proxy?url={quote(video, safe='')}"
    return _result("douyin", title=title or "抖音视频", videoUrl=video or url, coverUrl=cover, author=author)


# ================================================================
#  小红书提取
#  策略一: __INITIAL_STATE__ 解析 originVideoKey 拼接 CDN（无水印）
#  策略二: yt-dlp fallback
#  策略三: masterUrl fallback（有水印，兜底）
# ================================================================

# NOTE: 小红书无水印视频的核心原理：
#   - masterUrl 指向的是消费者端视频，画面上烧录了水印
#   - originVideoKey 是视频在云存储的原始 key，拼接 CDN 前缀后获得无水印原始文件
#   - CDN 前缀如 https://sns-video-al.xhscdn.com/ + originVideoKey = 无水印 MP4
XHS_CDN_PREFIXES = [
    "https://sns-video-al.xhscdn.com/",
    "https://sns-video-hw.xhscdn.com/",
    "https://sns-video-bd.xhscdn.com/",
]

# NOTE: 小红书图片无水印的核心原理：
#   - imageList 返回的 url / urlDefault 末尾带有 CDN 图片处理后缀（如 !nd_dft_wlteh_webp_3）
#   - 这些后缀控制图片裁剪、格式转换以及水印叠加
#   - 去掉后缀（! 之后的部分）即可获取原始无水印图片
_XHS_IMG_SUFFIX_RE = re.compile(r"![a-zA-Z0-9_]+$")


def _xhsStripImgSuffix(url: str) -> str:
    """移除小红书图片 CDN URL 末尾的图片处理后缀（含水印叠加指令）"""
    # 先分离 query string
    base, _, qs = url.partition("?")
    base = _XHS_IMG_SUFFIX_RE.sub("", base)
    return f"{base}?{qs}" if qs else base


def _xhsNoWatermark(url: str) -> str:
    """
    移除小红书 CDN URL 中的水印参数（仅对 URL 参数控制的水印有效）

    HACK: 画面烧录水印无法通过此方式去除，仅作为 masterUrl fallback 的辅助优化
    """
    url = re.sub(r"sns_watermark=1", "sns_watermark=0", url)
    return re.sub(r"[&?]watermark=[^&]*", "", url)


async def _xhsVerifyCdnUrl(url: str) -> bool:
    """快速 HEAD 请求验证 CDN 拼接的 URL 是否可访问"""
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            r = await c.head(url, headers={"User-Agent": UA})
            # 200 或 206 都算可用（某些 CDN 对 HEAD 返回 206）
            return r.status_code in (200, 206)
    except Exception:
        return False


async def _extractXiaohongshu(url: str) -> dict:
    realUrl = await _resolveRedirects(url)

    # 从 URL 中提取笔记 ID
    noteId = ""
    for pat in [r"explore/(\w+)", r"discovery/item/(\w+)", r"note/(\w+)"]:
        m = re.search(pat, realUrl) or re.search(pat, url)
        if m:
            noteId = m.group(1)
            break
    if not noteId:
        raise HTTPException(status_code=400, detail="无法解析小红书笔记 ID")

    title = video = cover = author = ""
    originVideoKey = ""
    masterUrlFallback = ""  # 带水印的 masterUrl，作为最后兜底
    all_images: list[str] = []  # NOTE: 图文笔记中的全部图片

    # --- 策略一：__INITIAL_STATE__ 解析 originVideoKey ---
    hdrs = {"User-Agent": MOBILE_UA, "Referer": "https://www.xiaohongshu.com/"}

    for pageUrl in dict.fromkeys([  # NOTE: 去重并保持顺序
        realUrl if ("xsec_token" in realUrl or "explore/" in realUrl) else None,
        f"https://www.xiaohongshu.com/discovery/item/{noteId}",
        f"https://www.xiaohongshu.com/explore/{noteId}",
    ]):
        if pageUrl is None or (originVideoKey and cover):
            continue
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=20) as c:
                resp = await c.get(pageUrl, headers=hdrs)
                if "/404/" in str(resp.url):
                    continue
                m = re.search(r"window\.__INITIAL_STATE__\s*=\s*(.+?)</script>", resp.text, re.S)
                if not m:
                    continue
                data = json_repair.loads(m.group(1).strip().rstrip(";").replace("undefined", "null"))

                # 新版路径 (2024+)
                noteInfo = data.get("noteData", {}).get("data", {}).get("noteData", {})
                # 旧版路径
                if not noteInfo or not noteInfo.get("noteId"):
                    detailMap = data.get("note", {}).get("noteDetailMap", {})
                    noteInfo = detailMap.get(noteId, {}).get("note", {})
                    if not noteInfo:
                        noteInfo = next(
                            (v.get("note", {}) for v in detailMap.values() if v.get("note")), {}
                        )

                if not noteInfo:
                    continue

                title = title or noteInfo.get("title", "")
                author = author or noteInfo.get("user", {}).get("nickname", "")

                # NOTE: 优先提取 originVideoKey — 这是无水印视频的关键
                videoData = noteInfo.get("video", {})
                if not originVideoKey:
                    # 路径 1: video.consumer.originVideoKey（最常见）
                    consumer = videoData.get("consumer", {})
                    if isinstance(consumer, dict):
                        originVideoKey = consumer.get("originVideoKey", "")
                    # 路径 2: video.originVideoKey（部分旧版页面）
                    if not originVideoKey:
                        originVideoKey = videoData.get("originVideoKey", "")
                    # 路径 3: 递归搜索
                    if not originVideoKey:
                        for k in _searchDict(noteInfo, "originVideoKey"):
                            if isinstance(k, str) and k:
                                originVideoKey = k
                                break

                # masterUrl 作为带水印的 fallback
                if not masterUrlFallback:
                    stream = videoData.get("media", {}).get("stream", {})
                    for codec in ("h264", "h265", "av1"):
                        sl = stream.get(codec, [])
                        if sl and isinstance(sl, list):
                            mu = sl[0].get("masterUrl", "")
                            if mu:
                                masterUrlFallback = _xhsNoWatermark(mu)
                                break
                if not masterUrlFallback:
                    for mu in _searchDict(noteInfo, "masterUrl"):
                        if isinstance(mu, str) and mu.startswith("http"):
                            masterUrlFallback = _xhsNoWatermark(mu)
                            break

                # 封面 + 全部图片（去水印处理）
                if not cover:
                    imgList = noteInfo.get("imageList", [])
                    if not imgList:
                        # 递归搜索 imageList
                        for il in _searchDict(noteInfo, "imageList"):
                            if isinstance(il, list) and il:
                                imgList = il
                                break
                    if imgList:
                        for imgItem in imgList:
                            if isinstance(imgItem, dict):
                                # NOTE: 优先从 infoList 中找到最大尺寸的原始图
                                # infoList 包含多种分辨率图片，取最大的那张
                                bestImg = ""
                                infoList = imgItem.get("infoList", [])
                                if isinstance(infoList, list) and infoList:
                                    # 按图片面积降序，取最大分辨率
                                    sorted_info = sorted(
                                        [i for i in infoList if isinstance(i, dict) and i.get("url")],
                                        key=lambda i: (i.get("width", 0) or 0) * (i.get("height", 0) or 0),
                                        reverse=True,
                                    )
                                    if sorted_info:
                                        bestImg = sorted_info[0]["url"]
                                # 回退到 urlDefault / url
                                if not bestImg:
                                    bestImg = imgItem.get("urlDefault", "") or imgItem.get("url", "")
                                if bestImg:
                                    # NOTE: 移除 CDN 图片处理后缀，去除水印叠加指令
                                    cleanImg = _xhsStripImgSuffix(bestImg)
                                    # 通过后端代理下载，绕过小红书 CDN 防盗链和 CORS
                                    proxyImg = f"/api/video-extract/proxy?url={quote(cleanImg, safe='')}"
                                    if proxyImg not in all_images:
                                        all_images.append(proxyImg)
                        if all_images and not cover:
                            cover = all_images[0]
        except Exception as e:
            logger.warning(f"Xiaohongshu page parse failed: {e}")

    # 用 originVideoKey 拼接 CDN 无水印链接
    if originVideoKey:
        for prefix in XHS_CDN_PREFIXES:
            cdnUrl = f"{prefix}{originVideoKey}"
            if await _xhsVerifyCdnUrl(cdnUrl):
                video = cdnUrl
                logger.info("XHS watermark-free video via originVideoKey: %s", cdnUrl[:80])
                break
        # 即使 HEAD 验证失败，也优先使用第一个 CDN 前缀（可能是 HEAD 被限制但 GET 正常）
        if not video:
            video = f"{XHS_CDN_PREFIXES[0]}{originVideoKey}"
            logger.info("XHS using originVideoKey CDN (unverified): %s", video[:80])

    # --- 策略二：yt-dlp fallback ---
    if not video and HAS_YTDLP:
        try:
            info = await _ytdlpInfo(realUrl)
            if info:
                vUrl = _bestFormat(info.get("formats", []))
                if not vUrl:
                    vUrl = info.get("url", "")
                if vUrl:
                    video = _xhsNoWatermark(vUrl)
                    title = title or info.get("title", "")
                    cover = cover or info.get("thumbnail", "")
                    author = author or info.get("uploader", "") or info.get("uploader_id", "")
                    logger.info("XHS video via yt-dlp: %s", video[:80])
        except Exception as e:
            logger.warning(f"Xiaohongshu yt-dlp failed: {e}")

    # --- 策略三：masterUrl fallback（有水印） ---
    if not video and masterUrlFallback:
        video = masterUrlFallback
        logger.warning("XHS falling back to masterUrl (may have watermark): %s", video[:80])

    # NOTE: 无视频链接但有图片 → 判定为图文笔记
    content_type = "video" if video else "image"
    return _result(
        "xiaohongshu",
        title=title or "小红书笔记",
        videoUrl=video,
        coverUrl=cover,
        author=author,
        images=all_images,
        contentType=content_type,
    )


# ================================================================
#  快手提取
#  策略一: bugpk API（绕过 TLS 指纹拦截，最稳定）
#  策略二: __APOLLO_STATE__ 自主解析
# ================================================================

async def _extractKuaishou(url: str) -> dict:
    title = video = cover = author = ""

    # --- 策略一：bugpk API ---
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get("https://api.bugpk.com/api/ksjx", params={"url": url})
            d = r.json()
            if d.get("code") == 200 and d.get("data"):
                dd = d["data"]
                video, cover, title, author = dd.get("url", ""), dd.get("cover", ""), dd.get("title", ""), dd.get("author", "")
    except Exception as e:
        logger.warning(f"Kuaishou bugpk failed: {e}")

    if video:
        return _result("kuaishou", title=title or "快手视频", videoUrl=video, coverUrl=cover, author=author)

    # --- 策略二：__APOLLO_STATE__ ---
    try:
        realUrl = await _resolveRedirects(url)
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as c:
            resp = await c.get(realUrl, headers={"User-Agent": UA, "Referer": "https://v.kuaishou.com/"})
            m = re.search(r"window\.__APOLLO_STATE__\s*=\s*(\{.*?\});", resp.text, re.S)
            if m:
                raw = json_repair.loads(m.group(1))
                dc = raw.get("defaultClient", {})
                # 找 VisionVideoDetailPhoto 条目
                photo = next(
                    (v for v in dc.values()
                     if isinstance(v, dict) and v.get("__typename") == "VisionVideoDetailPhoto"),
                    None,
                )
                if photo:
                    # 多格式评选：videoResource JSON 中多清晰度 → HEVC 优先 → 最高码率
                    candidates = []
                    for key in ("photoH265Url", "photoUrl"):
                        if photo.get(key):
                            candidates.append(("hevc" if "265" in key else "h264", 0, photo[key]))
                    vr = photo.get("videoResource", {}).get("json", {}) or {}
                    for codec in ("hevc", "h264"):
                        for adapt in vr.get(codec, {}).get("adaptationSet", []):
                            if not isinstance(adapt, dict):
                                continue
                            for rep in adapt.get("representation", []):
                                if isinstance(rep, dict) and rep.get("url"):
                                    candidates.append((codec, rep.get("maxBitrate", 0), rep["url"]))

                    # HEVC 优先 → 最高码率
                    candidates.sort(key=lambda x: (0 if x[0] == "h264" else 1, x[1]), reverse=True)
                    video = candidates[0][2] if candidates else ""
                    title = photo.get("caption", "")
                    author = photo.get("userName", "")
                    covers = _searchDict(raw, "coverUrl")
                    cover = covers[0] if covers else ""
    except Exception as e:
        logger.warning(f"Kuaishou APOLLO failed: {e}")

    if not video and not cover:
        raise HTTPException(status_code=422, detail="快手视频解析失败")

    return _result("kuaishou", title=title or "快手视频", videoUrl=video, coverUrl=cover, author=author)


# ================================================================
#  B站提取
#  策略一: yt-dlp 元信息 + B站 API DASH（无水印，可代理）
#  策略二: B站 API 手动解析（BV/av/ep/ss 全支持）
#  DASH 音视频合并用 ffmpeg -c copy 秒合
# ================================================================

async def _mergeDash(videoStreamUrl: str, audioStreamUrl: str, bvid: str) -> str:
    """下载 DASH 视频+音频流并用 ffmpeg 合并为无水印 MP4"""
    if not FFMPEG:
        raise RuntimeError("ffmpeg not found")

    name = f"{bvid}_{uuid.uuid4().hex[:8]}.mp4"
    out = MERGED_DIR / name
    tmpV, tmpA = MERGED_DIR / f"_v_{name}.m4s", MERGED_DIR / f"_a_{name}.m4s"

    hdrs = {"User-Agent": UA, "Referer": "https://www.bilibili.com/"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(10, read=300), verify=False) as c:
        async def dl(url: str, dest: Path):
            async with c.stream("GET", url, headers=hdrs) as r:
                with open(dest, "wb") as f:
                    async for chunk in r.aiter_bytes(65536):
                        f.write(chunk)

        # NOTE: 并发下载两个流，减少近一半等待时间
        await asyncio.gather(dl(videoStreamUrl, tmpV), dl(audioStreamUrl, tmpA))

    await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: subprocess.run(
            [FFMPEG, "-i", str(tmpV), "-i", str(tmpA), "-c", "copy", "-y", str(out)],
            capture_output=True, timeout=120,
        ),
    )
    tmpV.unlink(missing_ok=True)
    tmpA.unlink(missing_ok=True)

    if out.exists() and out.stat().st_size > 0:
        return f"/api/video-extract/merged/{name}"
    raise RuntimeError("ffmpeg merge failed")


async def _biliDash(client: httpx.AsyncClient, bvid: str, cid: str, meta: dict) -> Optional[dict]:
    """
    尝试 DASH 模式获取 B站视频
    NOTE: DASH 视频流无右上角水印，durl 模式有水印。优先 DASH + ffmpeg 合并。
    """
    try:
        r = await client.get(
            "https://api.bilibili.com/x/player/playurl",
            params={"bvid": bvid, "cid": cid, "qn": 80, "fnval": 16, "fourk": 1},
            headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
        )
        dash = r.json().get("data", {}).get("dash", {})
        videos = dash.get("video", [])
        audios = dash.get("audio", [])
        if not videos:
            return None

        videos.sort(key=lambda v: v.get("width", 0) * v.get("height", 0), reverse=True)
        bestV = videos[0].get("baseUrl") or videos[0].get("base_url") or ""
        bestA = (audios[0].get("baseUrl") or audios[0].get("base_url") or "") if audios else ""

        # 有 ffmpeg + 有音频 → 合并无水印 MP4
        if FFMPEG and bestV and bestA:
            try:
                merged = await _mergeDash(bestV, bestA, bvid)
                return _result("bilibili", videoUrl=merged, **meta)
            except Exception as e:
                logger.warning(f"DASH merge failed: {e}")

        # 无 ffmpeg → 代理视频流（无水印但无声音）
        if bestV:
            return _result("bilibili", videoUrl=f"/api/video-extract/proxy?url={quote(bestV, safe='')}", **meta)
    except Exception as e:
        logger.warning(f"Bili DASH failed: {e}")
    return None


async def _extractBilibili(url: str) -> dict:
    realUrl = await _resolveRedirects(url)
    biliHdr = {"User-Agent": UA, "Referer": "https://www.bilibili.com/"}

    async with httpx.AsyncClient(timeout=15) as c:
        # --- 番剧 ep ---
        ep = re.search(r"bangumi/play/ep(\d+)", realUrl)
        if ep:
            return await _biliEp(c, ep.group(1))

        # --- 番剧 ss ---
        ss = re.search(r"bangumi/play/ss(\d+)", realUrl)
        if ss:
            return await _biliSs(c, ss.group(1))

        # --- 普通视频 BV/av ---
        bvid = ""
        m = re.search(r"(BV\w{10})", realUrl)
        if m:
            bvid = m.group(1)
        else:
            m = re.search(r"av(\d+)", realUrl)
            if m:
                bvid = f"av{m.group(1)}"

        # yt-dlp 辅助提取 BV号
        if not bvid and HAS_YTDLP:
            try:
                info = await _ytdlpInfo(realUrl)
                if info:
                    wp = info.get("webpage_url", "")
                    m = re.search(r"(BV\w{10})", wp)
                    if m:
                        bvid = m.group(1)
            except Exception:
                pass

        if not bvid:
            raise HTTPException(status_code=400, detail="无法解析 B站视频 ID")

        # 获取视频基本信息
        apiUrl = (
            f"https://api.bilibili.com/x/web-interface/view?aid={bvid[2:]}"
            if bvid.startswith("av")
            else f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        )
        resp = await c.get(apiUrl, headers=biliHdr)
        d = resp.json()
        if d.get("code") != 0:
            raise ValueError(d.get("message", "API error"))

        data = d["data"]
        meta = {
            "title": data.get("title", "B站视频"),
            "coverUrl": data.get("pic", ""),
            "author": data.get("owner", {}).get("name", ""),
        }
        actualBvid = data.get("bvid", bvid)
        cid = str(data.get("cid", ""))

        # 优先 DASH
        if cid:
            dashResult = await _biliDash(c, actualBvid, cid, meta)
            if dashResult:
                return dashResult

        # 兜底：durl 模式（有水印但音视频合一）
        if cid:
            try:
                r = await c.get(
                    "https://api.bilibili.com/x/player/playurl",
                    params={"bvid": actualBvid, "cid": cid, "qn": 80, "fnval": 0, "platform": "html5"},
                    headers=biliHdr,
                )
                durl = r.json().get("data", {}).get("durl", [])
                if durl:
                    bestUrl = max(durl, key=lambda x: x.get("size", 0)).get("url", "")
                    if bestUrl:
                        return _result("bilibili", videoUrl=f"/api/video-extract/proxy?url={quote(bestUrl, safe='')}", **meta)
            except Exception:
                pass

        return _result("bilibili", videoUrl=f"https://www.bilibili.com/video/{actualBvid}", **meta)


async def _biliEp(client: httpx.AsyncClient, epId: str) -> dict:
    """提取番剧单集"""
    r = await client.get(
        "https://api.bilibili.com/pgc/view/web/season",
        params={"ep_id": epId},
        headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
    )
    result = r.json().get("result", {})
    eps = result.get("episodes", [])
    for sec in result.get("section", []):
        if isinstance(sec, dict):
            eps.extend(sec.get("episodes", []))

    ep = next((e for e in eps if isinstance(e, dict) and str(e.get("ep_id")) == epId), None)
    if not ep:
        raise HTTPException(status_code=404, detail=f"未找到 ep{epId}")

    # DASH 播放地址
    pr = await client.get(
        "https://api.bilibili.com/pgc/player/web/v2/playurl",
        params={"fnval": 12240, "ep_id": epId},
        headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
    )
    videos = pr.json().get("result", {}).get("video_info", {}).get("dash", {}).get("video", [])
    videoUrl = ""
    if videos:
        videos.sort(key=lambda v: v.get("width", 0) * v.get("height", 0), reverse=True)
        videoUrl = videos[0].get("baseUrl") or videos[0].get("base_url") or ""

    if not videoUrl:
        durl = pr.json().get("result", {}).get("video_info", {}).get("durl", [])
        if durl:
            videoUrl = durl[0].get("url", "")

    proxyUrl = f"/api/video-extract/proxy?url={quote(videoUrl, safe='')}" if videoUrl else f"https://www.bilibili.com/bangumi/play/ep{epId}"

    return _result(
        "bilibili",
        title=ep.get("share_copy") or ep.get("long_title") or "B站番剧",
        videoUrl=proxyUrl,
        coverUrl=ep.get("cover", ""),
        author=result.get("title", ""),
    )


async def _biliSs(client: httpx.AsyncClient, ssId: str) -> dict:
    """提取番剧整季 → 返回第一集"""
    r = await client.get(
        "https://api.bilibili.com/pgc/web/season/section",
        params={"season_id": ssId},
        headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"},
    )
    result = r.json().get("result", {})
    eps = result.get("main_section", {}).get("episodes", [])
    for sec in result.get("section", []):
        if isinstance(sec, dict):
            eps.extend(sec.get("episodes", []))

    if not eps:
        raise HTTPException(status_code=404, detail=f"ss{ssId} 无剧集")

    firstEpId = str(eps[0].get("id", ""))
    if firstEpId:
        return await _biliEp(client, firstEpId)

    return _result("bilibili", title="B站番剧", videoUrl=f"https://www.bilibili.com/bangumi/play/ss{ssId}")


# ================================================================
#  路由与 API 接口
# ================================================================

EXTRACTORS = {
    "douyin": _extractDouyin,
    "xiaohongshu": _extractXiaohongshu,
    "kuaishou": _extractKuaishou,
    "bilibili": _extractBilibili,
}


@router.post("/extract", response_model=VideoExtractResponse)
async def extractVideo(req: VideoExtractRequest):
    """
    视频链接提取接口
    NOTE: 自动识别平台 → 多策略 fallback 提取无水印视频直链和封面
    """
    cleanUrl = _extractUrl(req.url)
    platform = _detectPlatform(cleanUrl)
    if not platform:
        raise HTTPException(status_code=400, detail="不支持的平台，支持: 抖音、小红书、快手、B站")

    result = await EXTRACTORS[platform](cleanUrl)
    return VideoExtractResponse(**result)


@router.get("/credit-cost")
async def getCreditCost():
    """获取视频提取功能的积分消耗"""
    return {"creditCost": CREDIT_COST}


@router.get("/merged/{filename}")
async def serveMergedVideo(filename: str):
    """提供 ffmpeg 合并后的无水印视频文件下载"""
    path = MERGED_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    size = path.stat().st_size

    async def _iter():
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter(), media_type="video/mp4",
        headers={
            "Content-Length": str(size),
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/proxy")
async def proxyVideo(url: str = Query(..., description="视频/图片 CDN 直链")):
    """
    媒体代理下载接口
    NOTE: 各平台 CDN 有防盗链（需 Referer）+ CORS 限制，前端无法直接下载，后端代理转发。
    同时支持视频和图片代理。
    """
    referer = "https://www.bilibili.com/"
    if "douyin" in url or "365yg" in url or "iesdouyin" in url or "byteimg" in url or "douyinpic" in url:
        referer = "https://www.douyin.com/"
    elif "xiaohongshu" in url or "xhscdn" in url:
        referer = "https://www.xiaohongshu.com/"

    client = httpx.AsyncClient(
        timeout=httpx.Timeout(10, read=120), follow_redirects=True,
    )
    try:
        resp = await client.send(
            client.build_request("GET", url, headers={"User-Agent": UA, "Referer": referer}),
            stream=True,
        )
        if resp.status_code != 200:
            await resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=resp.status_code, detail=f"CDN returned {resp.status_code}")

        ct = resp.headers.get("content-type", "application/octet-stream")

        # NOTE: 根据 URL 和 content-type 智能判定文件类型
        is_image = any(ext in url.lower() for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"))
        is_video = any(ext in url.lower() for ext in (".mp4", ".m4s", ".flv", ".mov"))

        if is_image:
            # 图片类型智能推断
            if ".png" in url.lower():
                ct = "image/png"
            elif ".webp" in url.lower():
                ct = "image/webp"
            elif ".gif" in url.lower():
                ct = "image/gif"
            else:
                ct = "image/jpeg"
            filename = "image.jpg"
        elif is_video or ct == "application/octet-stream":
            # B站 .m4s 返回 octet-stream，浏览器不识别，强制设为 video/mp4
            ct = "video/mp4"
            filename = "video.mp4"
        else:
            filename = "download"

        hdrs = {
            "Content-Type": ct,
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Allow-Origin": "*",
        }
        cl = resp.headers.get("content-length")
        if cl:
            hdrs["Content-Length"] = cl

        async def _stream():
            try:
                async for chunk in resp.aiter_bytes(65536):
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()

        return StreamingResponse(_stream(), headers=hdrs, media_type=ct)
    except httpx.HTTPError as e:
        logger.error(f"Media proxy failed: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch media: {e}")
