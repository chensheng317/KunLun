"""
语音合成 & 音色克隆服务
NOTE: 基于 MiniMax T2A V2 API，提供商业级文本转语音和音色克隆能力
- 语音合成：支持 speech-2.8-hd/turbo 等 8 个模型版本，40+ 语言
- 音色克隆：三步流程（上传复刻音频 → 上传示例音频(可选) → 快速复刻）
- 系统音色：覆盖中/英/日/韩/多语种共 60+ 精选音色
"""

import os
import base64
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts-synthesis", tags=["语音合成"])

# MiniMax API 配置
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_BASE_URL = "https://api.minimaxi.com/v1"

# 积分消耗配置
CREDIT_PER_SYNTHESIS = 5


# ==================== 数据模型 ====================

class VoiceOption(BaseModel):
    """可用音色"""
    id: str = Field(..., description="音色 ID")
    name: str = Field(..., description="音色名称")
    gender: str = Field(default="", description="性别标签")
    style: str = Field(default="", description="风格标签")
    language: str = Field(default="中文", description="语言分类")
    category: str = Field(default="system", description="音色类型: system / cloned")


class TtsSynthesisRequest(BaseModel):
    """语音合成请求参数"""
    text: str = Field(..., max_length=10000, description="待合成文本，最大 10000 字符")
    voiceId: str = Field(default="female-shaonv", description="音色 ID")
    model: str = Field(default="speech-2.8-hd", description="模型选择")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="语速 0.5~2.0")
    pitch: int = Field(default=0, ge=-12, le=12, description="音调 -12~12")
    volume: float = Field(default=1.0, ge=0.1, le=10.0, description="音量 0.1~10.0")
    emotion: str = Field(default="", description="情感预设")
    audioFormat: str = Field(default="mp3", description="输出格式: mp3/wav/flac/pcm")
    languageBoost: str = Field(default="", description="语言增强")


class TtsSynthesisResponse(BaseModel):
    """语音合成响应"""
    audioBase64: str = Field(default="", description="Base64 编码的音频数据")
    audioFormat: str = Field(default="mp3", description="音频格式")
    textLength: int = Field(default=0, description="合成文本字数")
    audioDuration: int = Field(default=0, description="音频时长(ms)")
    creditCost: int = Field(default=0, description="消耗算力")
    traceId: str = Field(default="", description="请求追踪 ID")


class VoiceCloneRequest(BaseModel):
    """音色克隆请求参数"""
    fileId: int = Field(..., description="复刻音频的 file_id")
    voiceId: str = Field(..., min_length=8, max_length=256, description="自定义音色 ID")
    promptAudioId: Optional[int] = Field(default=None, description="示例音频 file_id（可选）")
    promptText: Optional[str] = Field(default=None, description="示例音频对应文本")
    text: Optional[str] = Field(default=None, max_length=1000, description="试听文本")
    model: str = Field(default="speech-2.8-hd", description="试听模型")
    needNoiseReduction: bool = Field(default=False, description="是否开启降噪")
    needVolumeNormalization: bool = Field(default=False, description="是否开启音量归一化")
    languageBoost: Optional[str] = Field(default=None, description="语言增强")


class VoiceCloneResponse(BaseModel):
    """音色克隆响应"""
    success: bool = Field(default=False)
    voiceId: str = Field(default="")
    demoAudioUrl: str = Field(default="", description="试听音频 URL")
    message: str = Field(default="")


# ==================== 系统音色列表 ====================
# NOTE: 从 MiniMax 官方系统音色列表精选，按语言分类
# 完整列表参考: https://platform.minimaxi.com/docs/faq/system-voice-id

PRESET_VOICES: list[VoiceOption] = [
    # —— 中文 (普通话) ——
    VoiceOption(id="male-qn-qingse", name="青涩青年", gender="男", style="温柔", language="中文"),
    VoiceOption(id="male-qn-jingying", name="精英青年", gender="男", style="沉稳", language="中文"),
    VoiceOption(id="male-qn-badao", name="霸道青年", gender="男", style="强势", language="中文"),
    VoiceOption(id="male-qn-daxuesheng", name="大学生", gender="男", style="朝气", language="中文"),
    VoiceOption(id="female-shaonv", name="少女", gender="女", style="甜美", language="中文"),
    VoiceOption(id="female-yujie", name="御姐", gender="女", style="成熟", language="中文"),
    VoiceOption(id="female-chengshu", name="成熟女性", gender="女", style="知性", language="中文"),
    VoiceOption(id="female-tianmei", name="甜美女声", gender="女", style="可爱", language="中文"),
    VoiceOption(id="male-qn-qingse-jingpin", name="青涩青年β", gender="男", style="温柔", language="中文"),
    VoiceOption(id="male-qn-jingying-jingpin", name="精英青年β", gender="男", style="沉稳", language="中文"),
    VoiceOption(id="male-qn-badao-jingpin", name="霸道青年β", gender="男", style="强势", language="中文"),
    VoiceOption(id="male-qn-daxuesheng-jingpin", name="大学生β", gender="男", style="朝气", language="中文"),
    VoiceOption(id="female-shaonv-jingpin", name="少女β", gender="女", style="甜美", language="中文"),
    VoiceOption(id="female-yujie-jingpin", name="御姐β", gender="女", style="成熟", language="中文"),
    VoiceOption(id="female-chengshu-jingpin", name="成熟女性β", gender="女", style="知性", language="中文"),
    VoiceOption(id="female-tianmei-jingpin", name="甜美女声β", gender="女", style="可爱", language="中文"),
    VoiceOption(id="clever_boy", name="聪明男童", gender="男", style="童声", language="中文"),
    VoiceOption(id="cute_boy", name="可爱男童", gender="男", style="童声", language="中文"),
    VoiceOption(id="lovely_girl", name="萌萌女童", gender="女", style="童声", language="中文"),
    VoiceOption(id="cartoon_pig", name="卡通猪小琪", gender="中", style="卡通", language="中文"),
    VoiceOption(id="bingjiao_didi", name="病娇弟弟", gender="男", style="角色", language="中文"),
    VoiceOption(id="junlang_nanyou", name="俊朗男友", gender="男", style="角色", language="中文"),
    VoiceOption(id="chunzhen_xuedi", name="纯真学弟", gender="男", style="角色", language="中文"),
    VoiceOption(id="lengdan_xiongzhang", name="冷淡学长", gender="男", style="角色", language="中文"),
    VoiceOption(id="badao_shaoye", name="霸道少爷", gender="男", style="角色", language="中文"),
    VoiceOption(id="tianxin_xiaoling", name="甜心小玲", gender="女", style="角色", language="中文"),
    VoiceOption(id="qiaopi_mengmei", name="俏皮萌妹", gender="女", style="角色", language="中文"),
    VoiceOption(id="wumei_yujie", name="妩媚御姐", gender="女", style="角色", language="中文"),
    VoiceOption(id="diadia_xuemei", name="嗲嗲学妹", gender="女", style="角色", language="中文"),
    VoiceOption(id="danya_xuejie", name="淡雅学姐", gender="女", style="角色", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Reliable_Executive", name="沉稳高管", gender="男", style="商务", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_News_Anchor", name="新闻女声", gender="女", style="播音", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Mature_Woman", name="傲娇御姐", gender="女", style="成熟", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Unrestrained_Young_Man", name="不羁青年", gender="男", style="自由", language="中文"),
    VoiceOption(id="Arrogant_Miss", name="嚣张小姐", gender="女", style="角色", language="中文"),
    VoiceOption(id="Robot_Armor", name="机械战甲", gender="中", style="特效", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_HK_Flight_Attendant", name="港普空姐", gender="女", style="服务", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Humorous_Elder", name="搞笑大爷", gender="男", style="幽默", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Gentleman", name="温润男声", gender="男", style="温柔", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Warm_Bestie", name="温暖闺蜜", gender="女", style="亲切", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Male_Announcer", name="播报男声", gender="男", style="播音", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Sweet_Lady", name="甜美女声N", gender="女", style="甜美", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Lyrical_Voice", name="抒情男声", gender="男", style="抒情", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Radio_Host", name="电台男主播", gender="男", style="播音", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Gentle_Senior", name="温柔学姐", gender="女", style="温柔", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Crisp_Girl", name="清脆少女", gender="女", style="清脆", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Soft_Girl", name="柔和少女", gender="女", style="柔和", language="中文"),
    VoiceOption(id="Chinese (Mandarin)_Kind-hearted_Elder", name="花甲奶奶", gender="女", style="慈祥", language="中文"),

    # —— 中文 (粤语) ——
    VoiceOption(id="Cantonese_ProfessionalHost（F)", name="专业女主持", gender="女", style="播音", language="粤语"),
    VoiceOption(id="Cantonese_GentleLady", name="温柔女声", gender="女", style="温柔", language="粤语"),
    VoiceOption(id="Cantonese_ProfessionalHost（M)", name="专业男主持", gender="男", style="播音", language="粤语"),
    VoiceOption(id="Cantonese_PlayfulMan", name="活泼男声", gender="男", style="活泼", language="粤语"),
    VoiceOption(id="Cantonese_CuteGirl", name="可爱女孩", gender="女", style="可爱", language="粤语"),

    # —— 英文 ——
    VoiceOption(id="English_Graceful_Lady", name="Graceful Lady", gender="女", style="优雅", language="英文"),
    VoiceOption(id="English_Trustworthy_Man", name="Trustworthy Man", gender="男", style="可靠", language="英文"),
    VoiceOption(id="English_Aussie_Bloke", name="Aussie Bloke", gender="男", style="澳洲", language="英文"),
    VoiceOption(id="English_Whispering_girl", name="Whispering Girl", gender="女", style="低语", language="英文"),
    VoiceOption(id="English_Diligent_Man", name="Diligent Man", gender="男", style="勤勉", language="英文"),
    VoiceOption(id="English_Gentle-voiced_man", name="Gentle Man", gender="男", style="温和", language="英文"),
    VoiceOption(id="Santa_Claus", name="Santa Claus", gender="男", style="节日", language="英文"),
    VoiceOption(id="Charming_Lady", name="Charming Lady", gender="女", style="迷人", language="英文"),
    VoiceOption(id="Sweet_Girl", name="Sweet Girl", gender="女", style="甜美", language="英文"),
    VoiceOption(id="Serene_Woman", name="Serene Woman", gender="女", style="沉静", language="英文"),
    VoiceOption(id="Attractive_Girl", name="Attractive Girl", gender="女", style="魅力", language="英文"),

    # —— 日文 ——
    VoiceOption(id="Japanese_IntellectualSenior", name="知性学长", gender="男", style="知性", language="日文"),
    VoiceOption(id="Japanese_DecisivePrincess", name="果断公主", gender="女", style="果断", language="日文"),
    VoiceOption(id="Japanese_LoyalKnight", name="忠实骑士", gender="男", style="忠诚", language="日文"),
    VoiceOption(id="Japanese_DominantMan", name="统治者", gender="男", style="强势", language="日文"),
    VoiceOption(id="Japanese_ColdQueen", name="冷酷女王", gender="女", style="冷酷", language="日文"),
    VoiceOption(id="Japanese_GentleButler", name="温柔管家", gender="男", style="温柔", language="日文"),
    VoiceOption(id="Japanese_KindLady", name="温和淑女", gender="女", style="温和", language="日文"),
    VoiceOption(id="Japanese_GracefulMaiden", name="优雅少女", gender="女", style="优雅", language="日文"),
    VoiceOption(id="Japanese_InnocentBoy", name="纯真少年", gender="男", style="纯真", language="日文"),
    VoiceOption(id="Japanese_OptimisticYouth", name="乐观青年", gender="男", style="乐观", language="日文"),

    # —— 韩文 ——
    VoiceOption(id="Korean_SweetGirl", name="Sweet Girl", gender="女", style="甜美", language="韩文"),
    VoiceOption(id="Korean_CheerfulBoyfriend", name="Cheerful BF", gender="男", style="活泼", language="韩文"),
    VoiceOption(id="Korean_ReliableSister", name="Reliable Sister", gender="女", style="可靠", language="韩文"),
    VoiceOption(id="Korean_CalmGentleman", name="Calm Gentleman", gender="男", style="沉稳", language="韩文"),
    VoiceOption(id="Korean_ElegantPrincess", name="Elegant Princess", gender="女", style="优雅", language="韩文"),

    # —— 其他语言精选 ——
    VoiceOption(id="French_Male_Speech_New", name="Level-Headed Man", gender="男", style="稳重", language="法文"),
    VoiceOption(id="French_Female_News Anchor", name="Patient Presenter", gender="女", style="播音", language="法文"),
    VoiceOption(id="German_FriendlyMan", name="Friendly Man", gender="男", style="友好", language="德文"),
    VoiceOption(id="German_SweetLady", name="Sweet Lady", gender="女", style="甜美", language="德文"),
    VoiceOption(id="Spanish_SereneWoman", name="Serene Woman", gender="女", style="沉静", language="西班牙文"),
    VoiceOption(id="Spanish_CaptivatingStoryteller", name="Storyteller", gender="男", style="叙述", language="西班牙文"),
    VoiceOption(id="Portuguese_SentimentalLady", name="Sentimental Lady", gender="女", style="感性", language="葡萄牙文"),
    VoiceOption(id="Portuguese_NarratorNarrator", name="Narrator", gender="男", style="叙述", language="葡萄牙文"),
    VoiceOption(id="Russian_ReliableMan", name="Reliable Man", gender="男", style="可靠", language="俄文"),
    VoiceOption(id="Russian_BrightHeroine", name="Bright Queen", gender="女", style="明亮", language="俄文"),
    VoiceOption(id="Indonesian_SweetGirl", name="Sweet Girl", gender="女", style="甜美", language="印尼文"),
    VoiceOption(id="Indonesian_CalmWoman", name="Calm Woman", gender="女", style="沉静", language="印尼文"),
    VoiceOption(id="Thai_female_1_sample1", name="Confident Woman", gender="女", style="自信", language="泰文"),
    VoiceOption(id="hindi_male_1_v2", name="Trustworthy Advisor", gender="男", style="可靠", language="印地文"),
    VoiceOption(id="hindi_female_2_v1", name="Tranquil Woman", gender="女", style="沉静", language="印地文"),
    VoiceOption(id="Italian_NarratorNarrator", name="Narrator", gender="男", style="叙述", language="意大利文"),
    VoiceOption(id="Arabic_CalmWoman", name="Calm Woman", gender="女", style="沉静", language="阿拉伯文"),
    VoiceOption(id="Arabic_FriendlyGuy", name="Friendly Guy", gender="男", style="友好", language="阿拉伯文"),
    VoiceOption(id="Turkish_CalmWoman", name="Calm Woman", gender="女", style="沉静", language="土耳其文"),
    VoiceOption(id="Vietnamese_kindhearted_girl", name="Kind Girl", gender="女", style="善良", language="越南文"),
]

# 支持的情感列表 — 含 speech-2.8 新增选项
SUPPORTED_EMOTIONS = [
    {"id": "", "name": "自动", "description": "模型根据文本自动匹配"},
    {"id": "happy", "name": "开心", "description": "愉悦、积极"},
    {"id": "sad", "name": "悲伤", "description": "低沉、伤感"},
    {"id": "angry", "name": "生气", "description": "愤怒、强烈"},
    {"id": "fearful", "name": "恐惧", "description": "紧张、不安"},
    {"id": "disgusted", "name": "厌恶", "description": "反感、不满"},
    {"id": "surprised", "name": "惊讶", "description": "吃惊、意外"},
    {"id": "calm", "name": "平静", "description": "中性、自然"},
    {"id": "fluent", "name": "生动", "description": "生动流畅（仅2.6）"},
    {"id": "whisper", "name": "低语", "description": "低声耳语（仅2.6）"},
]

# 可用模型列表
AVAILABLE_MODELS = [
    {
        "id": "speech-2.8-hd",
        "name": "Speech 2.8 HD",
        "description": "最新旗舰，最高音质，支持语气词标签",
        "languages": 40,
        "latest": True,
    },
    {
        "id": "speech-2.8-turbo",
        "name": "Speech 2.8 Turbo",
        "description": "最新旗舰快速版，低延迟，支持语气词",
        "languages": 40,
        "latest": True,
    },
    {
        "id": "speech-2.6-hd",
        "name": "Speech 2.6 HD",
        "description": "高品质，支持耳语和生动情感",
        "languages": 40,
        "latest": False,
    },
    {
        "id": "speech-2.6-turbo",
        "name": "Speech 2.6 Turbo",
        "description": "快速版，支持耳语和生动情感",
        "languages": 40,
        "latest": False,
    },
]

# 支持的语言增强选项
LANGUAGE_BOOST_OPTIONS = [
    {"id": "", "name": "不设置"},
    {"id": "auto", "name": "自动检测"},
    {"id": "Chinese", "name": "中文普通话"},
    {"id": "Chinese,Yue", "name": "中文粤语"},
    {"id": "English", "name": "英文"},
    {"id": "Japanese", "name": "日文"},
    {"id": "Korean", "name": "韩文"},
    {"id": "French", "name": "法文"},
    {"id": "German", "name": "德文"},
    {"id": "Spanish", "name": "西班牙文"},
    {"id": "Portuguese", "name": "葡萄牙文"},
    {"id": "Russian", "name": "俄文"},
    {"id": "Arabic", "name": "阿拉伯文"},
    {"id": "Indonesian", "name": "印尼文"},
    {"id": "Thai", "name": "泰文"},
    {"id": "Vietnamese", "name": "越南文"},
    {"id": "Hindi", "name": "印地文"},
    {"id": "Italian", "name": "意大利文"},
    {"id": "Turkish", "name": "土耳其文"},
]


# ==================== 语音合成 API ====================

@router.get("/voices")
async def getAvailableVoices():
    """获取可用音色列表（含系统音色和克隆音色标识）"""
    return {
        "voices": [v.model_dump() for v in PRESET_VOICES],
        "total": len(PRESET_VOICES),
    }


@router.get("/emotions")
async def getAvailableEmotions():
    """获取支持的情感列表"""
    return {"emotions": SUPPORTED_EMOTIONS}


@router.get("/models")
async def getAvailableModels():
    """获取可用模型列表"""
    return {"models": AVAILABLE_MODELS}


@router.get("/language-boost-options")
async def getLanguageBoostOptions():
    """获取语言增强选项"""
    return {"options": LANGUAGE_BOOST_OPTIONS}


@router.post("/synthesize", response_model=TtsSynthesisResponse)
async def synthesizeSpeech(req: TtsSynthesisRequest):
    """
    文本转语音合成
    NOTE: 调用 MiniMax T2A V2 API，返回 hex 编码音频 → 转 base64 给前端
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="合成文本不能为空")

    if not MINIMAX_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="MiniMax API Key 未配置，请在 .env 中设置 MINIMAX_API_KEY",
        )

    try:
        audioBase64, traceId, audioDuration = await callMinimaxTts(req)
        return TtsSynthesisResponse(
            audioBase64=audioBase64,
            audioFormat=req.audioFormat,
            textLength=len(req.text),
            audioDuration=audioDuration,
            creditCost=CREDIT_PER_SYNTHESIS,
            traceId=traceId,
        )
    except httpx.TimeoutException:
        logger.error("MiniMax TTS API timeout")
        raise HTTPException(status_code=504, detail="语音合成超时，请稍后重试")
    except Exception as e:
        logger.error(f"MiniMax TTS API failed: {e}")
        raise HTTPException(status_code=500, detail=f"语音合成失败: {str(e)}")


async def callMinimaxTts(req: TtsSynthesisRequest) -> tuple[str, str, int]:
    """
    调用 MiniMax T2A V2 接口
    NOTE: 返回 (base64音频数据, traceId, audioDuration)
    API 文档: https://platform.minimaxi.com/document/T2A%20V2
    
    IMPORTANT: T2A V2 API 非流式模式返回的音频是 hex 编码字符串，
    需要将 hex 转为 bytes 后再 base64 编码给前端使用
    """
    # NOTE: T2A V2 要求嵌套结构的请求体
    payload: dict = {
        "model": req.model,
        "text": req.text,
        "stream": False,
        "voice_setting": {
            "voice_id": req.voiceId,
            "speed": req.speed,
            "vol": req.volume,
            "pitch": req.pitch,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": req.audioFormat if req.audioFormat != "wav" else "mp3",
            "channel": 1,
        },
    }

    # NOTE: 仅在有情感设置时传递 emotion 字段
    if req.emotion:
        payload["voice_setting"]["emotion"] = req.emotion

    # NOTE: 语言增强
    if req.languageBoost:
        payload["language_boost"] = req.languageBoost

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{MINIMAX_BASE_URL}/t2a_v2",
            headers={
                "Authorization": f"Bearer {MINIMAX_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

        if resp.status_code != 200:
            logger.error(f"MiniMax API returned status {resp.status_code}: {resp.text}")
            raise Exception(f"API 返回状态码 {resp.status_code}")

        data = resp.json()

        # 检查业务级错误码
        baseResp = data.get("base_resp", {})
        statusCode = baseResp.get("status_code", -1)
        if statusCode != 0:
            errorMsg = baseResp.get("status_msg", "unknown error")
            raise Exception(f"API 业务错误: {errorMsg}")

        # NOTE: T2A V2 非流式响应中，音频数据在 data.data.audio 字段，是 hex 编码字符串
        audioData = data.get("data", {})
        audioHex = audioData.get("audio", "")
        traceId = data.get("trace_id", "")

        # 获取音频附加信息
        extraInfo = data.get("extra_info", {})
        audioDuration = extraInfo.get("audio_length", 0)

        if not audioHex:
            raise Exception("API 返回音频数据为空")

        # IMPORTANT: 将 hex 编码转为 bytes，再转为 base64 供前端使用
        audioBytes = bytes.fromhex(audioHex)
        audioBase64 = base64.b64encode(audioBytes).decode("utf-8")

        return audioBase64, traceId, audioDuration


# ==================== 音色克隆 API ====================

@router.post("/voice-clone/upload-file")
async def uploadCloneFile(file: UploadFile = File(...)):
    """
    上传复刻音频文件
    NOTE: 支持 mp3/m4a/wav 格式，10秒~5分钟，最大 20MB
    这是音色克隆的第一步
    """
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=503, detail="MiniMax API Key 未配置")

    # 校验文件格式
    allowedTypes = {"audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav",
                    "audio/m4a", "audio/x-m4a", "audio/mp3"}
    if file.content_type and file.content_type not in allowedTypes:
        # 也通过文件扩展名校验
        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        if ext not in {"mp3", "m4a", "wav"}:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式: {file.content_type}。请上传 mp3/m4a/wav 格式的音频"
            )

    fileContent = await file.read()

    # 校验文件大小 — 最大 20MB
    if len(fileContent) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小超过 20MB 限制")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{MINIMAX_BASE_URL}/files/upload",
                headers={
                    "Authorization": f"Bearer {MINIMAX_API_KEY}",
                },
                data={"purpose": "voice_clone"},
                files={"file": (file.filename, fileContent, file.content_type or "audio/mpeg")},
            )

            if resp.status_code != 200:
                logger.error(f"Upload clone file failed: {resp.status_code} - {resp.text}")
                raise Exception(f"上传失败，API 状态码: {resp.status_code}")

            data = resp.json()
            baseResp = data.get("base_resp", {})
            if baseResp.get("status_code", -1) != 0:
                raise Exception(f"上传失败: {baseResp.get('status_msg', 'unknown')}")

            fileInfo = data.get("file", {})
            return {
                "fileId": fileInfo.get("file_id"),
                "filename": fileInfo.get("filename"),
                "bytes": fileInfo.get("bytes"),
                "createdAt": fileInfo.get("created_at"),
            }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="上传超时，请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload clone file error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voice-clone/upload-prompt")
async def uploadPromptAudio(file: UploadFile = File(...)):
    """
    上传示例音频文件（可选步骤）
    NOTE: 提供示例音频可增强音色相似度和稳定性
    支持 mp3/m4a/wav 格式，时长需小于 8 秒，最大 20MB
    """
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=503, detail="MiniMax API Key 未配置")

    fileContent = await file.read()

    if len(fileContent) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小超过 20MB 限制")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{MINIMAX_BASE_URL}/files/upload",
                headers={
                    "Authorization": f"Bearer {MINIMAX_API_KEY}",
                },
                data={"purpose": "prompt_audio"},
                files={"file": (file.filename, fileContent, file.content_type or "audio/mpeg")},
            )

            if resp.status_code != 200:
                logger.error(f"Upload prompt audio failed: {resp.status_code} - {resp.text}")
                raise Exception(f"上传失败，API 状态码: {resp.status_code}")

            data = resp.json()
            baseResp = data.get("base_resp", {})
            if baseResp.get("status_code", -1) != 0:
                raise Exception(f"上传失败: {baseResp.get('status_msg', 'unknown')}")

            fileInfo = data.get("file", {})
            return {
                "fileId": fileInfo.get("file_id"),
                "filename": fileInfo.get("filename"),
                "bytes": fileInfo.get("bytes"),
                "createdAt": fileInfo.get("created_at"),
            }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="上传超时，请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload prompt audio error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/voice-clone/clone", response_model=VoiceCloneResponse)
async def cloneVoice(req: VoiceCloneRequest):
    """
    执行音色快速复刻
    NOTE: 每次调用成本约 ¥9.9，请确保前端已做二次确认
    复刻得到的音色若 7 天内未正式调用则系统会自动删除
    """
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=503, detail="MiniMax API Key 未配置")

    # 校验 voice_id 格式规则
    voiceId = req.voiceId
    if not voiceId[0].isalpha():
        raise HTTPException(status_code=400, detail="voice_id 首字符必须为英文字母")
    if voiceId[-1] in ("-", "_"):
        raise HTTPException(status_code=400, detail="voice_id 末位不能是 - 或 _")
    if not all(c.isalnum() or c in ("-", "_") for c in voiceId):
        raise HTTPException(status_code=400, detail="voice_id 仅允许字母、数字、- 和 _")

    try:
        payload: dict = {
            "file_id": req.fileId,
            "voice_id": voiceId,
            "need_noise_reduction": req.needNoiseReduction,
            "need_volume_normalization": req.needVolumeNormalization,
        }

        # 可选：示例音频
        if req.promptAudioId and req.promptText:
            payload["clone_prompt"] = {
                "prompt_audio": req.promptAudioId,
                "prompt_text": req.promptText,
            }

        # 可选：试听
        if req.text:
            payload["text"] = req.text
            payload["model"] = req.model

        if req.languageBoost:
            payload["language_boost"] = req.languageBoost

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{MINIMAX_BASE_URL}/voice_clone",
                headers={
                    "Authorization": f"Bearer {MINIMAX_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if resp.status_code != 200:
                logger.error(f"Voice clone API failed: {resp.status_code} - {resp.text}")
                raise Exception(f"克隆失败，API 状态码: {resp.status_code}")

            data = resp.json()
            baseResp = data.get("base_resp", {})
            statusCode = baseResp.get("status_code", -1)

            if statusCode != 0:
                errorMsg = baseResp.get("status_msg", "unknown")
                raise Exception(f"克隆失败: {errorMsg}")

            # 检查风控
            inputSensitive = data.get("input_sensitive", {})
            if isinstance(inputSensitive, dict) and inputSensitive.get("type", 0) != 0:
                raise Exception("上传音频命中风控审核，请更换音频内容")

            demoAudio = data.get("demo_audio", "")

            return VoiceCloneResponse(
                success=True,
                voiceId=voiceId,
                demoAudioUrl=demoAudio or "",
                message="音色克隆成功！可在语音合成中使用此音色",
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="克隆请求超时，请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice clone error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credit-cost")
async def getCreditCost():
    """获取算力消耗信息"""
    return {
        "perSynthesis": CREDIT_PER_SYNTHESIS,
        "description": "语音合成每次消耗 5 算力",
        "cloneCost": "¥9.9/次",
        "cloneDescription": "音色克隆每次调用成本约 ¥9.9",
    }
