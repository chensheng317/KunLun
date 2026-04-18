import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical,
  Beaker,
  ChevronLeft,
  Sparkles,
  Atom,
  TestTubes,
  Lock,
} from 'lucide-react';
import KnowledgeDistillTool from '../../components/lab/KnowledgeDistillTool';

/**
 * 实验室主页面 — 昆仑工坊正在测试的实验性功能
 * NOTE: 炼金台/实验室场景风格，赛博工业配色
 * 首期上线"知识蒸馏"功能，后续持续扩展
 */

interface LabTool {
  id: string;
  name: string;
  description: string;
  icon: typeof FlaskConical;
  glowColor: string;
  status: 'active' | 'coming';
}

const LAB_TOOLS: LabTool[] = [
  {
    id: 'knowledge-distill',
    name: '知识蒸馏',
    description: '将一篇公众号文章智能蒸馏成多篇结构化知识文档，保留原文精华，去除冗余信息',
    icon: Beaker,
    glowColor: 'rgba(62,237,231,0.25)',
    status: 'active',
  },
];

const TOOL_CONFIG_LS_KEY = 'kunlun_tool_configs';

/** 获取工具配置（来自管理后台） */
function getToolEnabled(toolId: string): boolean {
  try {
    const raw = localStorage.getItem(TOOL_CONFIG_LS_KEY);
    if (!raw) return true;
    const stored = JSON.parse(raw) as { id: string; enabled: boolean }[];
    const found = stored.find((s) => s.id === toolId);
    return found ? found.enabled : true;
  } catch { return true; }
}

export default function LabPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [toolEnabled, setToolEnabled] = useState<Record<string, boolean>>({});

  // 读取工具启停状态
  useEffect(() => {
    const configs: Record<string, boolean> = {};
    LAB_TOOLS.forEach((t) => { configs[t.id] = getToolEnabled(t.id); });
    setToolEnabled(configs);
    const handleFocus = () => {
      const c: Record<string, boolean> = {};
      LAB_TOOLS.forEach((t) => { c[t.id] = getToolEnabled(t.id); });
      setToolEnabled(c);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <div
      className={`h-full ${
        activeTool ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'
      }`}
    >
      {/* 实验室背景装饰 — 分子网格 + 浮动粒子 */}
      <div className="absolute inset-0 bg-hex-pattern pointer-events-none opacity-60" />

      {/* NOTE: activeTool 时整个页面不滚动，滚动发生在右侧详情面板内部 */}
      <div className={`relative z-10 p-8 space-y-8 max-w-7xl mx-auto w-full ${activeTool ? 'h-full overflow-hidden flex flex-col' : ''}`}>
        {/* 页面标题区 */}
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
                <FlaskConical
                  size={22}
                  className="text-nexus-primary"
                />
                {activeTool === 'knowledge-distill' ? '知识蒸馏' : '实验室'}
                {/* NOTE: BETA 标签使用紫色（需求 #9） */}
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30 font-bold tracking-wider">
                  BETA
                </span>
              </h1>
              <p className="text-sm text-nexus-muted mt-1.5">
                {activeTool === 'knowledge-distill'
                  ? '将公众号文章智能蒸馏为结构化知识文档，保留原创精华'
                  : '昆仑工坊的前沿技术试验场，探索AI能力的更多可能。'}
              </p>
            </div>
          </div>

          {/* 实验室状态指示 */}
          {!activeTool && (
            <div className="flex items-center gap-2 text-xs text-nexus-primary/70 bg-nexus-primary/5 px-3 py-1.5 rounded-lg border border-nexus-primary/10">
              <Atom size={12} className="animate-spin" style={{ animationDuration: '8s' }} />
              <span>实验环境运行中</span>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ---- 实验室工具列表视图 ---- */}
          {!activeTool && (
            <motion.div
              key="lab-grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* 功能卡片区 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {LAB_TOOLS.map((tool, index) => {
                  const Icon = tool.icon;
                  return (
                    <motion.button
                      key={tool.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      onClick={() => tool.status === 'active' && toolEnabled[tool.id] !== false && setActiveTool(tool.id)}
                      className={`cursor-target bg-nexus-surface border border-nexus-border rounded-2xl p-6 text-left relative overflow-hidden group hover:border-nexus-primary/30 transition-all duration-300 ${
                        tool.status === 'coming' || toolEnabled[tool.id] === false ? 'cursor-not-allowed' : ''
                      }`}
                      style={{
                        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
                      }}
                      disabled={tool.status === 'coming' || toolEnabled[tool.id] === false}
                    >
                      {/* NOTE: 被管理员关停的工具显示蒙版（需求 #7） */}
                      {toolEnabled[tool.id] === false && (
                        <div className="absolute inset-0 bg-nexus-bg/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-2 rounded-2xl">
                          <Lock size={24} className="text-nexus-muted/60" />
                          <span className="text-xs text-nexus-muted/60 font-medium">服务已暂停</span>
                        </div>
                      )}
                      {/* 悬浮光晕 */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, ${tool.glowColor}, transparent 70%)`,
                        }}
                      />

                      {/* 实验室装饰 — 角落气泡 */}
                      <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-nexus-primary/20 group-hover:bg-nexus-primary/40 transition-colors" />
                      <div className="absolute top-6 right-6 w-1.5 h-1.5 rounded-full bg-nexus-secondary/15 group-hover:bg-nexus-secondary/30 transition-colors" />

                      <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center group-hover:animate-ring-pulse">
                          <Icon size={22} className="text-nexus-primary" />
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-bg border border-nexus-border text-nexus-muted font-mono uppercase">
                          {tool.status === 'active' ? 'Lab' : 'Soon'}
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
                        <Sparkles size={11} className="text-nexus-primary/50" />
                        <span className="text-[10px] text-nexus-muted">
                          {tool.status === 'active' ? '点击进入实验' : '即将上线'}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* "更多实验室功能，敬请期待" 提示区 */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="relative"
              >
                <div className="bg-nexus-surface/50 border border-nexus-border/50 rounded-2xl p-8 text-center relative overflow-hidden">
                  {/* 背景装饰 — 实验室分子浮动光晕 */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute w-36 h-36 rounded-full opacity-[0.15]"
                      style={{
                        background: 'radial-gradient(circle, var(--color-nexus-primary), transparent 70%)',
                        top: '5%',
                        right: '10%',
                      }}
                    />
                    <div
                      className="absolute w-28 h-28 rounded-full opacity-[0.10]"
                      style={{
                        background: 'radial-gradient(circle, var(--color-nexus-secondary), transparent 70%)',
                        bottom: '5%',
                        left: '15%',
                      }}
                    />
                  </div>

                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3">
                      <TestTubes size={20} className="text-nexus-muted" />
                      <FlaskConical size={24} className="text-nexus-primary/40" />
                      <Atom size={20} className="text-nexus-muted" />
                    </div>
                    <div>
                      <p className="text-sm text-nexus-muted font-medium">
                        更多实验室功能，敬请期待
                      </p>
                      <p className="text-xs text-nexus-muted/60 mt-2">
                        我们正在持续探索 AI 技术的更多可能，新实验将在这里优先开放
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ---- 工具详情视图 ---- */}
          {activeTool === 'knowledge-distill' && (
            <motion.div
              key="tool-knowledge-distill"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
              className="flex-1 min-h-0"
            >
              <KnowledgeDistillTool />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
