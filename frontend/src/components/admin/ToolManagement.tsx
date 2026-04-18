import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  Beaker,
  Power,
  FlaskConical,
  Loader2,
} from 'lucide-react';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 工具管理面板
 * NOTE: 所有数据通过 REST API 从 PostgreSQL 读写，不再依赖 localStorage
 *
 * 后端数据结构映射：
 *   toolId      → 工具唯一标识（如 video-extract）
 *   name        → 工具名称
 *   enabled     → 是否启用
 *   creditCost  → 积分消耗（整数）
 *   description → 积分消耗描述文本
 *   extraConfig → 扩展配置（module, accessLevel 等）
 */

/** 后端 ToolConfigResponse 对应的前端类型 */
interface ToolConfig {
  id: number;
  toolId: string;
  name: string;
  enabled: boolean;
  creditCost: number;
  extraConfig: Record<string, unknown>;
  description: string | null;
  updatedAt: string;
}

/** 前端展示所需的图标映射 */
const TOOL_ICON_MAP: Record<string, typeof Link2> = {
  'video-extract': Link2,
  'viral-content': Sparkles,
  'image-gen': ImagePlus,
  'video-gen': Video,
  'tts-synthesis': Volume2,
  'watermark-removal': Eraser,
  'digital-human': User,
  'music-gen': Music,
  'json-prompt': Braces,
  'knowledge-distill': Beaker,
};

/** 工具所属模块映射 */
const TOOL_MODULE_MAP: Record<string, 'factory' | 'lab'> = {
  'video-extract': 'factory',
  'viral-content': 'factory',
  'image-gen': 'factory',
  'video-gen': 'factory',
  'tts-synthesis': 'factory',
  'watermark-removal': 'factory',
  'digital-human': 'factory',
  'music-gen': 'factory',
  'json-prompt': 'factory',
  'knowledge-distill': 'lab',
};

export default function ToolManagement() {
  const [tools, setTools] = useState<ToolConfig[]>([]);
  const [loading, setLoading] = useState(false);

  /** 从后端加载工具配置 */
  const loadTools = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<ToolConfig[]>('/api/config/tools');
      setTools(data || []);
    } catch (err) {
      console.error('Failed to load tool configs:', err);
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  /** 切换启停 */
  const handleToggle = useCallback(async (tool: ToolConfig) => {
    try {
      await apiClient.put(`/api/config/tools/${tool.toolId}`, {
        enabled: !tool.enabled,
      });
      await loadTools();
    } catch (err) {
      console.error('Failed to toggle tool:', err);
    }
  }, [loadTools]);

  /** 修改积分消耗描述 */
  const handleDescriptionChange = useCallback((toolId: string, value: string) => {
    // NOTE: 本地实时更新，避免打字时延迟；失焦时提交到后端
    setTools((prev) =>
      prev.map((t) => (t.toolId === toolId ? { ...t, description: value } : t)),
    );
  }, []);

  /** 失焦后保存描述到后端 */
  const handleDescriptionBlur = useCallback(async (tool: ToolConfig) => {
    try {
      await apiClient.put(`/api/config/tools/${tool.toolId}`, {
        description: tool.description || '',
      });
    } catch (err) {
      console.error('Failed to save tool description:', err);
    }
  }, []);

  /** 修改权限等级（存在 extraConfig 中） */
  const handleAccessChange = useCallback(async (tool: ToolConfig, level: string) => {
    try {
      const newExtra = { ...(tool.extraConfig || {}), accessLevel: level };
      await apiClient.put(`/api/config/tools/${tool.toolId}`, {
        extraConfig: newExtra,
      });
      await loadTools();
    } catch (err) {
      console.error('Failed to update access level:', err);
    }
  }, [loadTools]);

  /** 按模块分组 */
  const getModule = (toolId: string): 'factory' | 'lab' =>
    TOOL_MODULE_MAP[toolId] || ((tools.find((t) => t.toolId === toolId)?.extraConfig as Record<string, string>)?.module === 'lab' ? 'lab' : 'factory');

  const factoryTools = tools.filter((t) => getModule(t.toolId) === 'factory');
  const labTools = tools.filter((t) => getModule(t.toolId) === 'lab');

  /** 渲染工具表格 */
  const renderTable = (list: ToolConfig[]) => (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
            <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">工具名称</th>
            <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">状态</th>
            <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">算力消耗</th>
            <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">访问权限</th>
            <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">启停</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nexus-border">
          {list.map((tool) => {
            const Icon = TOOL_ICON_MAP[tool.toolId] || Wrench;
            const accessLevel = (tool.extraConfig as Record<string, string>)?.accessLevel || 'PRO';
            return (
              <tr key={tool.toolId} className={`hover:bg-nexus-bg/50 transition-colors ${!tool.enabled ? 'opacity-50' : ''}`}>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
                      <Icon size={16} className="text-nexus-primary" />
                    </div>
                    <span className="text-sm text-nexus-text font-medium">{tool.name}</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${
                    tool.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                  }`}>
                    <Power size={10} />
                    {tool.enabled ? '运行中' : '已停用'}
                  </span>
                </td>
                <td className="p-4">
                  <input
                    value={tool.description || ''}
                    onChange={(e) => handleDescriptionChange(tool.toolId, e.target.value)}
                    onBlur={() => handleDescriptionBlur(tool)}
                    className="bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text w-32 focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </td>
                <td className="p-4">
                  <select
                    value={accessLevel}
                    onChange={(e) => handleAccessChange(tool, e.target.value)}
                    className="bg-nexus-bg border border-nexus-border rounded-lg px-2 py-1.5 text-xs text-nexus-text focus:outline-none focus:border-amber-500/50 transition-all cursor-pointer"
                  >
                    <option value="FREE">FREE（所有用户）</option>
                    <option value="PRO">PRO（专业版+）</option>
                    <option value="ULTRA">ULTRA（旗舰版）</option>
                  </select>
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleToggle(tool)}
                    className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                      tool.enabled
                        ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                        : 'bg-nexus-border'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
                        tool.enabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8">
      {/* 页面标题 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <Wrench size={22} className="text-amber-400" />
          工具管理
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          管理数字工厂和实验室中的 AI 工具，控制启停、费率和访问权限。
        </p>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-amber-400" />
          <span className="ml-3 text-sm text-nexus-muted">加载中…</span>
        </div>
      ) : (
        <>
          {/* 数字工厂工具 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-sm font-bold text-nexus-text mb-4 flex items-center gap-2">
              <Wrench size={15} className="text-nexus-primary" />
              数字工厂
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30 font-bold">
                {factoryTools.length} 个工具
              </span>
            </h2>
            {renderTable(factoryTools)}
          </motion.div>

          {/* 实验室工具 */}
          {labTools.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h2 className="text-sm font-bold text-nexus-text mb-4 flex items-center gap-2">
                <FlaskConical size={15} className="text-nexus-primary" />
                实验室
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30 font-bold">
                  {labTools.length} 个工具
                </span>
              </h2>
              {renderTable(labTools)}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
