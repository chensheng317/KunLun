/**
 * 数字工厂 — 中心化积分消耗配置
 *
 * NOTE: 所有工具的积分扣费数值必须以此文件为唯一事实来源 (Single Source of Truth)。
 * 管理后台 (ToolManagement) 配置的数值优先级最高，此文件作为默认 fallback。
 *
 * 设计决策：
 *  - 每个工具使用 toolId 作为 key（与 DigitalFactoryPage 中的 id 一致）
 *  - 支持多子操作的工具使用嵌套结构（如 video-gen、viral-content）
 *  - creditHint 用于 UI 展示，与实际扣费数值必须保持一致
 *  - 未来可改为从后端 API 动态拉取，此文件可作为 fallback
 */

// ==================== 单一操作工具积分 ====================

/** 视频链接提取 — 每次消耗积分 */
export const CREDIT_VIDEO_EXTRACT = 1;

/** 图片去水印 — 每次消耗积分 */
export const CREDIT_WATERMARK_IMAGE = 1;

/** 视频去字幕 — 每次消耗积分 */
export const CREDIT_WATERMARK_VIDEO = 1;

/** 图片生成 — 每张消耗积分 */
export const CREDIT_IMAGE_GEN = 1;

/** 语音合成 — 每次合成消耗积分 */
export const CREDIT_TTS_SYNTHESIS = 1;

/** AI 营销音乐 — 每首消耗积分 */
export const CREDIT_MUSIC_GEN = 3;

/** 数字人形象 — 每次消耗积分 */
export const CREDIT_DIGITAL_HUMAN = 11;

/** JSON 提示词大师 — 每次消耗积分 */
export const CREDIT_JSON_PROMPT = 1;

// ==================== 多子操作工具积分 ====================

/**
 * 爆款拆解 & 创作 — 按阶段消耗
 *  - prompt: 拆解/生成提示词
 *  - video: 复刻视频
 */
export const CREDIT_VIRAL_CONTENT = {
  prompt: 1,
  video: 12,
} as const;

/**
 * 视频生成 — 按应用类型消耗
 * NOTE: 与 VideoGeneratorTool 中 APP_CREDITS 保持同步
 */
export const CREDIT_VIDEO_GEN = {
  upscale: 2,
  'ad-video': 11,
  'char-replace': 8,
  'motion-transfer': 8,
} as const;

// ==================== UI 标注辅助 ====================

/**
 * 工具积分提示映射
 * NOTE: 用于 DigitalFactoryPage 卡片展示，必须与实际扣费值同步
 */
export const TOOL_CREDIT_HINTS: Record<string, string> = {
  'video-extract': `${CREDIT_VIDEO_EXTRACT} 积分/次`,
  'watermark-removal': `${CREDIT_WATERMARK_IMAGE} 积分/次`,
  'image-gen': `${CREDIT_IMAGE_GEN} 积分/张`,
  'tts-synthesis': `${CREDIT_TTS_SYNTHESIS}积分/260字 · 克隆109积分`,
  'music-gen': `${CREDIT_MUSIC_GEN} 积分/首`,
  'digital-human': `${CREDIT_DIGITAL_HUMAN} 积分/秒`,
  'json-prompt': `${CREDIT_JSON_PROMPT} 积分/次`,
  'viral-content': `${CREDIT_VIRAL_CONTENT.prompt}-${CREDIT_VIRAL_CONTENT.video} 积分`,
  'video-gen': `${Math.min(...Object.values(CREDIT_VIDEO_GEN))}-${Math.max(...Object.values(CREDIT_VIDEO_GEN))} 积分`,
};
