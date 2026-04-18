import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  Link2,
  Sparkles,
  ImagePlus,
  Video,
  Volume2,
  Eraser,
  User,
  Music,
  Braces,
  ChevronLeft,
  Zap,
  Lock,
} from 'lucide-react';

import VideoExtractorTool from '../../components/factory/VideoExtractorTool';
import ViralContentTool from '../../components/factory/ViralContentTool';
import ImageGeneratorTool from '../../components/factory/ImageGeneratorTool';
import VideoGeneratorTool from '../../components/factory/VideoGeneratorTool';
import TtsSynthesisTool from '../../components/factory/TtsSynthesisTool';
import WatermarkRemovalTool from '../../components/factory/WatermarkRemovalTool';
import DigitalHumanTool from '../../components/factory/DigitalHumanTool';
import MusicGeneratorTool from '../../components/factory/MusicGeneratorTool';
import JsonPromptMasterTool from '../../components/factory/JsonPromptMasterTool';
import { TOOL_CREDIT_HINTS } from '../../components/factory/factory-credits';

/**
 * 数字工厂页 — 9大第三方工具集成面板
 * NOTE: 读取 ToolManagement 中配置的算力消耗和启停状态
 * 被管理员关停的工具会显示蒙版，用户无法进入
 */

const TOOL_CONFIG_LS_KEY = 'kunlun_tool_configs';

interface ToolConfig {
  id: string;
  name: string;
  description: string;
  icon: typeof Link2;
  /** 悬浮光晕颜色 — 使用品牌色 rgba 变体 */
  glowColor: string;
  creditHint: string;
  component: React.ComponentType;
}

const TOOLS: ToolConfig[] = [
  {
    id: 'video-extract',
    name: '视频链接提取',
    description: '输入视频链接，一键提取无水印源文件和封面，支持不同平台',
    icon: Link2,
    glowColor: 'rgba(62,237,231,0.25)',
    creditHint: TOOL_CREDIT_HINTS['video-extract'] ?? '1 积分/次',
    component: VideoExtractorTool,
  },
  {
    id: 'viral-content',
    name: '爆款拆解&创作',
    description: '上传图片，智能拆解爆款视频，输出提示词，一键复刻爆款视频',
    icon: Sparkles,
    glowColor: 'rgba(94,184,172,0.25)',
    creditHint: TOOL_CREDIT_HINTS['viral-content'] ?? '1-12 积分',
    component: ViralContentTool,
  },
  {
    id: 'image-gen',
    name: '图片生成',
    description: '基础 AI 图片生成 + 快捷应用，支持多种 AI 工作流',
    icon: ImagePlus,
    glowColor: 'rgba(62,237,231,0.2)',
    creditHint: TOOL_CREDIT_HINTS['image-gen'] ?? '1 积分/张',
    component: ImageGeneratorTool,
  },
  {
    id: 'video-gen',
    name: '视频生成',
    description: '基础 AI 视频生成 + 快捷应用，支持多种 AI 工作流',
    icon: Video,
    glowColor: 'rgba(62,237,231,0.25)',
    creditHint: TOOL_CREDIT_HINTS['video-gen'] ?? '2-11 积分',
    component: VideoGeneratorTool,
  },
  {
    id: 'tts-synthesis',
    name: '语音合成',
    description: 'AI 语音合成 & 音色克隆，系统音色、情感控制',
    icon: Volume2,
    glowColor: 'rgba(94,184,172,0.2)',
    creditHint: TOOL_CREDIT_HINTS['tts-synthesis'] ?? '1积分/260字 · 克隆109积分',
    component: TtsSynthesisTool,
  },
  {
    id: 'watermark-removal',
    name: '水印/字幕消除',
    description: '精准框选水印或字幕区域，AI 智能修复，无缝去除痕迹',
    icon: Eraser,
    glowColor: 'rgba(62,237,231,0.2)',
    creditHint: TOOL_CREDIT_HINTS['watermark-removal'] ?? '1 积分/次',
    component: WatermarkRemovalTool,
  },
  {
    id: 'digital-human',
    name: '数字人直播形象',
    description: '上传照片生成数字人形象，使用数字人形象直播/生成视频',
    icon: User,
    glowColor: 'rgba(62,237,231,0.25)',
    creditHint: TOOL_CREDIT_HINTS['digital-human'] ?? '11 积分/秒',
    component: DigitalHumanTool,
  },
  {
    id: 'music-gen',
    name: 'AI营销音乐',
    description: '上传参考音频，撰写风格/营销文案歌词，一键生成电商营销音乐',
    icon: Music,
    glowColor: 'rgba(62,237,231,0.25)',
    creditHint: TOOL_CREDIT_HINTS['music-gen'] ?? '3 积分/首',
    component: MusicGeneratorTool,
  },
  {
    id: 'json-prompt',
    name: 'JSON提示词大师',
    description: '智能生成/优化/反推提示词，提供不同电商场景下的prompt模板',
    icon: Braces,
    glowColor: 'rgba(94,184,172,0.25)',
    creditHint: TOOL_CREDIT_HINTS['json-prompt'] ?? '1 积分/次',
    component: JsonPromptMasterTool,
  },
];

/** localStorage key — 记住用户上次打开的工具，避免 tab 切换后丢失 */
const LS_KEY_ACTIVE_TOOL = 'kunlun_factory_active_tool';

/**
 * 获取管理员配置的工具状态
 * NOTE: 合并算力消耗和启停状态，联动管理后台 ToolManagement
 */
function getToolConfigs(): Record<string, { enabled: boolean; creditHint: string }> {
  try {
    const raw = localStorage.getItem(TOOL_CONFIG_LS_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as { id: string; enabled: boolean; creditHint: string }[];
    const map: Record<string, { enabled: boolean; creditHint: string }> = {};
    stored.forEach((s) => {
      map[s.id] = { enabled: s.enabled, creditHint: s.creditHint };
    });
    return map;
  } catch {
    return {};
  }
}

export default function DigitalFactoryPage() {
  const [activeTool, setActiveTool] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_KEY_ACTIVE_TOOL) || null;
    } catch { return null; }
  });

  // NOTE: 读取管理员在 ToolManagement 中配置的算力消耗和启停状态
  const [toolConfigs, setToolConfigs] = useState<Record<string, { enabled: boolean; creditHint: string }>>(getToolConfigs);

  // 每次聚焦页面时重新读取配置，确保管理员修改后用户端即时生效
  useEffect(() => {
    const handleFocus = () => setToolConfigs(getToolConfigs());
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  /**
   * NOTE: activeTool 变化时同步到 localStorage
   * 用户切换 tab 再回来时自动恢复到上次打开的工具
   */
  useEffect(() => {
    try {
      if (activeTool) {
        localStorage.setItem(LS_KEY_ACTIVE_TOOL, activeTool);
      } else {
        localStorage.removeItem(LS_KEY_ACTIVE_TOOL);
      }
    } catch { /* ignore */ }
  }, [activeTool]);

  /**
   * NOTE: 监听"open-factory-tool"事件
   * 资产库预览按钮触发 navigate-to-tool → WorkbenchPage 切到 factory tab
   * → 延迟派发 open-factory-tool → 此处接收并打开对应工具
   */
  const handleOpenTool = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.toolId) return;
    // NOTE: toolId 映射 — 资产库记录中的 toolId 与工厂内部 id 可能不一致
    const mapping: Record<string, string> = { 'music-generator': 'music-gen' };
    const internalId = mapping[detail.toolId] || detail.toolId;
    setActiveTool(internalId);
  }, []);

  useEffect(() => {
    window.addEventListener('open-factory-tool', handleOpenTool);
    return () => window.removeEventListener('open-factory-tool', handleOpenTool);
  }, [handleOpenTool]);

  const activeToolConfig = TOOLS.find((t) => t.id === activeTool);

  /** 获取工具的实际算力提示：管理员配置优先，否则使用默认值 */
  const getCreditHint = (tool: ToolConfig) => toolConfigs[tool.id]?.creditHint || tool.creditHint;

  /** 检查工具是否被管理员关停 */
  const isToolDisabled = (toolId: string) => {
    const cfg = toolConfigs[toolId];
    return cfg ? !cfg.enabled : false;
  };

  return (
    <div className={`h-full p-8 space-y-8 ${activeTool === 'music-gen' || activeTool === 'tts-synthesis' || activeTool === 'watermark-removal' || activeTool === 'json-prompt' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto max-w-7xl mx-auto'}`}>
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTool && (
            <button
              onClick={() => setActiveTool(null)}
              className="cursor-target w-9 h-9 rounded-xl bg-nexus-surface border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
              <Wrench size={22} className="text-nexus-primary" />
              {activeToolConfig ? activeToolConfig.name : '数字工厂'}
              {/* NOTE: PRO badge 使用琥珀/黄色（需求 #10） */}
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                PRO
              </span>
            </h1>
            <p className="text-sm text-nexus-muted mt-1.5">
              {activeToolConfig
                ? activeToolConfig.description
                : '接入第三方高级 API，解锁企业级自动化生产力。'}
            </p>
          </div>
        </div>
        {activeToolConfig && (
          <div className="flex items-center gap-2 text-xs text-nexus-primary/70 bg-nexus-primary/5 px-3 py-1.5 rounded-lg border border-nexus-primary/10">
            <Zap size={12} />
            <span>{getCreditHint(activeToolConfig)}</span>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* 工具列表视图 */}
        {!activeTool && (
          <motion.div
            key="tool-grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {TOOLS.map((tool, index) => {
              const Icon = tool.icon;
              const disabled = isToolDisabled(tool.id);
              return (
                <motion.button
                  key={tool.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  onClick={() => !disabled && setActiveTool(tool.id)}
                  disabled={disabled}
                  className={`cursor-target bg-nexus-surface border border-nexus-border rounded-2xl p-6 text-left relative overflow-hidden group transition-all duration-300 ${
                    disabled
                      ? 'cursor-not-allowed'
                      : 'hover:border-nexus-primary/30'
                  }`}
                  style={{
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                  }}
                >
                  {/* NOTE: 被管理员关停的工具显示蒙版（需求 #7） */}
                  {disabled && (
                    <div className="absolute inset-0 bg-nexus-bg/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-2 rounded-2xl">
                      <Lock size={24} className="text-nexus-muted/60" />
                      <span className="text-xs text-nexus-muted/60 font-medium">服务已暂停</span>
                    </div>
                  )}

                  {/* 悬浮光晕 — 使用品牌色系统 */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, ${tool.glowColor}, transparent 70%)`,
                    }}
                  />

                  <div className="flex items-start justify-between mb-4 relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
                      <Icon size={22} className="text-nexus-primary" />
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-bg border border-nexus-border text-nexus-muted font-mono uppercase">
                      API Tool
                    </span>
                  </div>

                  <div className="relative z-10">
                    <h3 className="font-bold text-nexus-text text-sm mb-1.5 group-hover:text-nexus-primary transition-colors">
                      {tool.name}
                    </h3>
                    <p className="text-[11px] text-nexus-muted leading-relaxed line-clamp-2">
                      {tool.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-2 relative z-10">
                    <Zap size={11} className="text-amber-400/60" />
                    <span className="text-[10px] text-nexus-muted">{getCreditHint(tool)}</span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* 工具详情视图 */}
        {activeTool && activeToolConfig && (
          <motion.div
            key={`tool-${activeTool}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className={activeTool === 'music-gen' || activeTool === 'json-prompt' ? 'flex-1 min-h-0 overflow-hidden' : ''}
          >
            <activeToolConfig.component />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
