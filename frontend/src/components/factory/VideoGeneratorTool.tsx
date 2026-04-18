import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video, Sparkles, Settings2, Lock, Wand2, Film, UserRoundCog, Move3d, Loader2,
} from 'lucide-react';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage, getUserScopedKey } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';
import {
  type PersistedTask,
  DragDropZone, FilePreview, TaskProgress, TaskResult, TaskFailed,
  ToggleSwitch, OptionGroup, CollapsibleSection,
} from './video-gen-panels';

/**
 * 视频生成工具组件
 * NOTE: 双 Tab 布局 —
 *   Tab 1: 快捷应用（4 个 RunningHub 工作流）
 *   Tab 2: 基础视频生成（Veo API，暂未开放）
 *
 * 设计决策：
 *  - 提交后立即将 taskId 持久化到 localStorage（参考 /async-task-persist-on-navigate）
 *  - 组件挂载时恢复进行中/已完成的任务
 *  - 4 个快捷应用使用独立的 localStorage key 和 pollRef
 *  - SUCCESS 回调中同步写入资产库和历史记录
 */

// ==================== 常量 ====================

const POLL_INTERVAL = 5000;
const APP_TYPES = ['upscale', 'ad-video', 'char-replace', 'motion-transfer'] as const;
type AppType = typeof APP_TYPES[number];

const LS_KEYS: Record<AppType, string> = {
  'upscale': 'kunlun_video_gen_upscale_task',
  'ad-video': 'kunlun_video_gen_ad_task',
  'char-replace': 'kunlun_video_gen_char_replace_task',
  'motion-transfer': 'kunlun_video_gen_motion_transfer_task',
};

const APP_LABELS: Record<AppType, string> = {
  'upscale': '视频高清修复',
  'ad-video': '一键广告视频',
  'char-replace': '角色替换',
  'motion-transfer': '动作迁移',
};

const APP_ENDPOINTS: Record<AppType, string> = {
  'upscale': '/api/video-gen/upscale/submit',
  'ad-video': '/api/video-gen/ad-video/submit',
  'char-replace': '/api/video-gen/char-replace/submit',
  'motion-transfer': '/api/video-gen/motion-transfer/submit',
};

/** NOTE: 每个子功能的积分消耗 — 与管理后台 '2-11 积分' 范围对应 */
const APP_CREDITS: Record<AppType, number> = {
  'upscale': 2,
  'ad-video': 11,
  'char-replace': 8,
  'motion-transfer': 8,
};

/** 广告创意渲染选项（经验证） */
const CREATIVE_RENDERING_OPTIONS = [
  { value: '1', label: '电影分镜' }, { value: '2', label: '现实景观' },
  { value: '3', label: '虚拟景观' }, { value: '4', label: '艺术创意' },
  { value: '5', label: '影视名场面' }, { value: '6', label: '微观世界分镜' },
  { value: '7', label: '动漫卡通分镜' }, { value: '8', label: '短视频封面' },
];

/** 视频拍摄手法选项（经验证，实际 16 个） */
const SHOOTING_METHOD_OPTIONS = [
  { value: '1', label: '产品分镜' }, { value: '2', label: '自然微动' },
  { value: '3', label: '低幅韵律' }, { value: '4', label: '情感叙事' },
  { value: '5', label: '人声旁白' }, { value: '6', label: '微观分镜' },
  { value: '7', label: '动漫分镜' }, { value: '8', label: '剧情分镜' },
  { value: '9', label: '微观慢镜' }, { value: '10', label: '万物出场' },
  { value: '11', label: '角色出场' }, { value: '12', label: '电影分镜片段' },
  { value: '13', label: '电影续集片段' }, { value: '14', label: '武侠特效' },
  { value: '15', label: '科幻特效' }, { value: '16', label: '电影续集(无定格)' },
];

/** 角色替换类型（经验证：完整替换=1） */
const REPLACE_TYPE_OPTIONS = [
  { value: '1', label: '完整替换' },
  { value: '2', label: '仅换装' },
  { value: '3', label: '仅换脸' },
];

/** 动作迁移分辨率（经验证：竖屏=3, 横屏=8） */
const RESOLUTION_OPTIONS = [
  { value: '3', label: '竖屏 720P' },
  { value: '8', label: '横屏 720P' },
];

// ==================== 工具函数 ====================

function loadTask(key: string): PersistedTask | null {
  try { const r = localStorage.getItem(getUserScopedKey(key)); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveTask(key: string, task: PersistedTask) {
  try { localStorage.setItem(getUserScopedKey(key), JSON.stringify(task)); } catch { /* ignore */ }
}

// ==================== 功能卡片配置 ====================

const APP_CARDS: { type: AppType; icon: React.ReactNode; desc: string; color: string }[] = [
  { type: 'upscale', icon: <Wand2 size={18} />, desc: '提高视频分辨率', color: 'var(--color-nexus-primary)' },
  { type: 'ad-video', icon: <Film size={18} />, desc: '一键生成高质量广告视频', color: '#F59E0B' },
  { type: 'char-replace', icon: <UserRoundCog size={18} />, desc: '替换视频中的人物形象', color: '#A78BFA' },
  { type: 'motion-transfer', icon: <Move3d size={18} />, desc: '让图片人物模仿视频动作', color: '#F472B6' },
];

// ==================== 主组件 ====================

export default function VideoGeneratorTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  const [activeTab, setActiveTab] = useState<'quick' | 'basic'>('quick');
  const [activeApp, setActiveApp] = useState<AppType>('upscale');
  const [error, setError] = useState('');

  // 4 个快捷应用的任务状态（从 localStorage 初始化）
  const [tasks, setTasks] = useState<Record<AppType, PersistedTask | null>>(() => ({
    'upscale': loadTask(LS_KEYS['upscale']),
    'ad-video': loadTask(LS_KEYS['ad-video']),
    'char-replace': loadTask(LS_KEYS['char-replace']),
    'motion-transfer': loadTask(LS_KEYS['motion-transfer']),
  }));
  const [loadingApps, setLoadingApps] = useState<Record<AppType, boolean>>({
    'upscale': false, 'ad-video': false, 'char-replace': false, 'motion-transfer': false,
  });

  // 独立的 pollRef（参考 /async-task-persist-on-navigate）
  const pollRefs = useRef<Record<AppType, ReturnType<typeof setInterval> | null>>({
    'upscale': null, 'ad-video': null, 'char-replace': null, 'motion-transfer': null,
  });
  // NOTE: 基于 taskId 的扣费去重 — 记录已完成扣费的 taskId，防止同一任务重复扣费
  // 设计决策：布尔标记在 pollTaskStatus 重新调用时会被重置为 false，无法防止
  // StrictMode 双重挂载等场景的重复扣费；改用 taskId 可彻底避免
  const creditedRef = useRef<Record<AppType, string | null>>({
    'upscale': null, 'ad-video': null, 'char-replace': null, 'motion-transfer': null,
  });

  // ========== 轮询清理 ==========
  useEffect(() => {
    return () => {
      APP_TYPES.forEach((t) => { if (pollRefs.current[t]) clearInterval(pollRefs.current[t]!); });
    };
  }, []);

  // ========== 通用轮询 ==========
  const pollTaskStatus = useCallback((taskId: string, appType: AppType) => {
    if (pollRefs.current[appType]) clearInterval(pollRefs.current[appType]!);
    setLoadingApps((p) => ({ ...p, [appType]: true }));

    pollRefs.current[appType] = setInterval(async () => {
      try {
        const resp = await fetch(`/api/video-gen/task/${taskId}`);
        if (!resp.ok) return;
        const data = await resp.json();

        const updated: PersistedTask = {
          taskId, status: data.status, resultUrl: data.resultUrl,
          results: data.results, errorMessage: data.errorMessage,
          timestamp: Date.now(), appType,
        };
        setTasks((p) => ({ ...p, [appType]: updated }));
        saveTask(LS_KEYS[appType], updated);

        if (data.status === 'SUCCESS' || data.status === 'FAILED') {
          // GUARD: 基于 taskId 去重 — 同一 taskId 只扣一次积分
          if (creditedRef.current[appType] === taskId) return;
          creditedRef.current[appType] = taskId;
          if (pollRefs.current[appType]) clearInterval(pollRefs.current[appType]!);
          setLoadingApps((p) => ({ ...p, [appType]: false }));

          // NOTE: 成功时同步写入资产库和历史记录
          if (data.status === 'SUCCESS') {
            const now = Date.now();
            const dateStr = new Date(now).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });
            const toolLabel = APP_LABELS[appType];
            const allResults = data.results || [];
            const mediaResults = allResults.filter((r: { url?: string }) => r.url);

            mediaResults.forEach((r: { url: string; outputType: string }, idx: number) => {
              // NOTE: 根据 outputType 判断资产类型，ZIP 等压缩包归为 file
              const assetType = ['mp4', 'gif'].includes(r.outputType) ? 'video'
                : ['zip', 'rar', '7z', 'tar', 'gz'].includes(r.outputType) ? 'file'
                : 'image';
              addAssetRecordWithSize({
                id: `asset-video-gen-${taskId}-${idx}`,
                name: `${toolLabel}_${taskId.slice(0, 8)}_${idx + 1}.${r.outputType || 'mp4'}`,
                source: '数字工厂-视频生成',
                type: assetType,
                downloadUrl: r.url,
                size: '-',
                date: dateStr,
                toolId: 'video-gen',
              });
            });

            addHistoryRecord({
              id: `history-video-gen-${taskId}`,
              toolName: '视频生成',
              action: toolLabel,
              status: 'success',
              time: new Date(now).toISOString(),
              duration: '-',
              output: `已生成 ${mediaResults.length} 个${toolLabel}结果，已保存至资产库。`,
            });

            // NOTE: 视频生成成功后扣除积分
            await consumeCredits(APP_CREDITS[appType], `视频生成-${toolLabel}`);
          }
          if (data.status === 'FAILED') scopedStorage.removeItem(LS_KEYS[appType]);
        }
      } catch { /* 轮询出错静默重试 */ }
    }, POLL_INTERVAL);
  }, []);

  // ========== 挂载恢复 ==========
  useEffect(() => {
    APP_TYPES.forEach((t) => {
      const saved = loadTask(LS_KEYS[t]);
      if (saved?.taskId && saved.status !== 'SUCCESS' && saved.status !== 'FAILED') {
        setTasks((p) => ({ ...p, [t]: saved }));
        pollTaskStatus(saved.taskId, t);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== 通用提交 ==========
  const submitTask = useCallback(async (appType: AppType, formData: FormData) => {
    if (loadingApps[appType]) { setError('请等待当前任务完成'); return; }

    // NOTE: 积分前置守卫 — 提交前检查余额是否充足，避免浪费后端算力
    const requiredCredits = APP_CREDITS[appType];
    if (!checkCredits(requiredCredits, `视频生成-${APP_LABELS[appType]}`)) return;

    setLoadingApps((p) => ({ ...p, [appType]: true }));
    setError('');

    try {
      const resp = await fetch(APP_ENDPOINTS[appType], { method: 'POST', body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.detail || '提交失败');
      }
      const data = await resp.json();
      const task: PersistedTask = {
        taskId: data.taskId, status: 'processing', timestamp: Date.now(), appType,
      };
      setTasks((p) => ({ ...p, [appType]: task }));
      saveTask(LS_KEYS[appType], task);
      pollTaskStatus(data.taskId, appType);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
      setLoadingApps((p) => ({ ...p, [appType]: false }));
    }
  }, [loadingApps, pollTaskStatus, checkCredits]);

  // ========== 重置 ==========
  const resetApp = useCallback((appType: AppType) => {
    if (pollRefs.current[appType]) clearInterval(pollRefs.current[appType]!);
    setTasks((p) => ({ ...p, [appType]: null }));
    setLoadingApps((p) => ({ ...p, [appType]: false }));
    scopedStorage.removeItem(LS_KEYS[appType]);
  }, []);

  const currentTask = tasks[activeApp];
  const isLoading = loadingApps[activeApp];
  const isCompleted = currentTask?.status === 'SUCCESS';
  const isFailed = currentTask?.status === 'FAILED';

  return (
    <div className="space-y-5">
      {/* ═══ Tab 切换 ═══ */}
      <div className="flex items-center gap-2 p-1 bg-nexus-surface/60 border border-nexus-border rounded-xl w-fit">
        <button onClick={() => setActiveTab('quick')}
          className={`cursor-target flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'quick'
              ? 'bg-gradient-to-r from-nexus-primary/20 to-nexus-secondary/15 text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.15)]'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}>
          <Sparkles size={14} /> 快捷应用
        </button>
        <button onClick={() => setActiveTab('basic')}
          className={`cursor-target flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'basic'
              ? 'bg-gradient-to-r from-nexus-primary/20 to-nexus-secondary/15 text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.15)]'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}>
          <Settings2 size={14} /> 基础视频生成
          <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-md border border-amber-500/20">即将开放</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* ═══ 快捷应用 Tab ═══ */}
        {activeTab === 'quick' && (
          <motion.div key="quick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-4">

            {/* 功能卡片导航 */}
            <div className="grid grid-cols-4 gap-3">
              {APP_CARDS.map((card) => {
                const hasTask = tasks[card.type]?.status === 'SUCCESS';
                const isProcessing = loadingApps[card.type];
                return (
                  <button key={card.type} onClick={() => setActiveApp(card.type)}
                    className={`cursor-target relative p-4 rounded-xl border text-left transition-all ${
                      activeApp === card.type
                        ? 'border-opacity-50 bg-opacity-5 shadow-[0_0_15px_rgba(62,237,231,0.1)]'
                        : 'border-nexus-border bg-nexus-surface/20 hover:border-opacity-30'
                    }`}
                    style={{
                      borderColor: activeApp === card.type ? card.color : undefined,
                      backgroundColor: activeApp === card.type ? `${card.color}08` : undefined,
                    }}>
                    <div className="flex items-center gap-2 mb-1.5"
                      style={{ color: activeApp === card.type ? card.color : 'var(--color-nexus-muted)' }}>
                      {card.icon}
                      <span className="text-xs font-bold">{APP_LABELS[card.type]}</span>
                    </div>
                    <p className="text-[10px] text-nexus-muted">{card.desc}</p>
                    {/* 状态角标 */}
                    {isProcessing && (
                      <div className="absolute top-2 right-2">
                        <Loader2 size={12} className="text-amber-400 animate-spin" />
                      </div>
                    )}
                    {hasTask && !isProcessing && (
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 当前功能的表单 + 结果 */}
            <div className="bg-nexus-surface/20 border border-nexus-border rounded-2xl overflow-hidden">
              {/* 标题栏 */}
              <div className="px-5 py-3.5 border-b border-nexus-border/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${APP_CARDS.find(c => c.type === activeApp)?.color}15`,
                    color: APP_CARDS.find(c => c.type === activeApp)?.color }}>
                  {APP_CARDS.find(c => c.type === activeApp)?.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-nexus-text">{APP_LABELS[activeApp]}</h3>
                  <p className="text-[10px] text-nexus-muted">{APP_CARDS.find(c => c.type === activeApp)?.desc}</p>
                </div>
              </div>

              {/* 内容区 (可滚动) */}
              <div className="p-5 space-y-4 max-h-[calc(100vh-420px)] overflow-y-auto scrollbar-hide">
                {/* 各功能的参数表单 */}
                {!isCompleted && !isLoading && !isFailed && (
                  <AppForm appType={activeApp} onSubmit={(fd) => submitTask(activeApp, fd)} />
                )}

                {/* 进度 */}
                {isLoading && (
                  <TaskProgress label={APP_LABELS[activeApp]}
                    taskId={currentTask?.taskId || ''} status={currentTask?.status || 'processing'} />
                )}

                {/* 成功结果 */}
                {isCompleted && (
                  <TaskResult results={currentTask?.results} onReset={() => resetApp(activeApp)} />
                )}

                {/* 失败 */}
                {isFailed && (
                  <TaskFailed message={currentTask?.errorMessage} onRetry={() => resetApp(activeApp)} />
                )}
              </div>
            </div>

            {/* 错误提示 */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══ 基础视频生成 Tab（锁定） ═══ */}
        {activeTab === 'basic' && (
          <motion.div key="basic" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="relative">
            <div className="absolute inset-0 z-20 bg-nexus-bg/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-nexus-surface border border-nexus-border flex items-center justify-center mx-auto">
                  <Lock size={28} className="text-nexus-muted/50" />
                </div>
                <h3 className="text-sm font-bold text-nexus-text">基础视频生成 · 即将开放</h3>
                <p className="text-[11px] text-nexus-muted max-w-xs leading-relaxed">
                  接入 Veo 3.1 / 3.1 Fast / 2 视频生成模型<br/>
                  支持多分辨率、画幅比例和参考图，需绑定付费账户后启用
                </p>
                <button onClick={() => setActiveTab('quick')}
                  className="cursor-target text-xs text-nexus-primary hover:text-nexus-primary/80 font-medium">
                  ← 使用快捷应用
                </button>
              </div>
            </div>
            {/* 置灰参数面板 */}
            <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-6 space-y-5 opacity-40 pointer-events-none min-h-[400px]">
              <div className="flex items-center gap-2">
                <Video size={14} className="text-nexus-primary" />
                <span className="text-xs text-nexus-muted font-mono uppercase">视频生成参数配置</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['Veo 3.1', 'Veo 3.1 Fast', 'Veo 2'].map((n) => (
                  <div key={n} className="p-3 rounded-xl border border-nexus-border bg-nexus-bg text-xs text-nexus-muted">{n}</div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==================== 各功能表单组件 ====================

function AppForm({ appType, onSubmit }: { appType: AppType; onSubmit: (fd: FormData) => void }) {
  switch (appType) {
    case 'upscale': return <UpscaleForm onSubmit={onSubmit} />;
    case 'ad-video': return <AdVideoForm onSubmit={onSubmit} />;
    case 'char-replace': return <CharReplaceForm onSubmit={onSubmit} />;
    case 'motion-transfer': return <MotionTransferForm onSubmit={onSubmit} />;
  }
}

/** 视频高清修复表单 */
function UpscaleForm({ onSubmit }: { onSubmit: (fd: FormData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const handleSubmit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    onSubmit(fd);
  };
  return (
    <div className="space-y-4">
      {!file ? (
        <DragDropZone accept="video/*" label="视频文件" hint="支持 MP4、MOV 等常见视频格式" onFile={setFile} />
      ) : (
        <FilePreview name={file.name} onRemove={() => setFile(null)} />
      )}
      <button onClick={handleSubmit} disabled={!file}
        className="cursor-target w-full h-11 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <Wand2 size={15} /> 开始高清修复
      </button>
    </div>
  );
}

/** 一键广告视频表单 */
function AdVideoForm({ onSubmit }: { onSubmit: (fd: FormData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [enableCreative, setEnableCreative] = useState(true);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [rendering, setRendering] = useState('1');
  const [enable4K, setEnable4K] = useState(false);
  const [enableVideo, setEnableVideo] = useState(true);
  const [shooting, setShooting] = useState('1');
  const [adText, setAdText] = useState('');
  const [videoText, setVideoText] = useState('');

  const handleSubmit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('enableCreativeAd', String(enableCreative));
    fd.append('removeBackground', String(removeBackground));
    fd.append('creativeRendering', rendering);
    fd.append('adResolution', '6'); // 固定 grok4.0
    fd.append('adCreativeText', adText);
    fd.append('enable4K', String(enable4K));
    fd.append('enableVideoMake', String(enableVideo));
    fd.append('shootingMethod', shooting);
    fd.append('videoCreativeText', videoText);
    onSubmit(fd);
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <DragDropZone accept="image/*" label="产品图片" hint="支持 JPG、PNG、WebP" onFile={setFile} />
      ) : (
        <FilePreview name={file.name} onRemove={() => setFile(null)} />
      )}

      <div className="space-y-3">
        <ToggleSwitch label="开启创意广告" value={enableCreative} onChange={setEnableCreative} />
        <ToggleSwitch label="去除原背景" value={removeBackground} onChange={setRemoveBackground} />
        <ToggleSwitch label="广告图 4K 输出" value={enable4K} onChange={setEnable4K} />
        <ToggleSwitch label="开启视频制作" value={enableVideo} onChange={setEnableVideo} />
      </div>

      <OptionGroup label="广告创意渲染" options={CREATIVE_RENDERING_OPTIONS} value={rendering} onChange={setRendering} />
      {enableVideo && (
        <OptionGroup label="视频拍摄手法" options={SHOOTING_METHOD_OPTIONS} value={shooting} onChange={setShooting} columns={6} />
      )}

      <CollapsibleSection title="补充文本提示词（可选）">
        <div>
          <label className="text-[10px] text-nexus-muted mb-1 block">广告创意补充</label>
          <textarea value={adText} onChange={(e) => setAdText(e.target.value)} rows={2} placeholder="无特殊要求可不填写"
            className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-lg px-3 py-2 text-xs text-nexus-text placeholder-nexus-muted/30 focus:border-nexus-primary/50 outline-none resize-none" />
        </div>
        <div>
          <label className="text-[10px] text-nexus-muted mb-1 block">视频创意补充</label>
          <textarea value={videoText} onChange={(e) => setVideoText(e.target.value)} rows={2} placeholder="无特殊要求可不填写"
            className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-lg px-3 py-2 text-xs text-nexus-text placeholder-nexus-muted/30 focus:border-nexus-primary/50 outline-none resize-none" />
        </div>
      </CollapsibleSection>

      <button onClick={handleSubmit} disabled={!file}
        className="cursor-target w-full h-11 bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <Film size={15} /> 一键生成广告视频
      </button>
    </div>
  );
}

/** 角色替换表单 */
function CharReplaceForm({ onSubmit }: { onSubmit: (fd: FormData) => void }) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [replaceType, setReplaceType] = useState('3');
  const [duration, setDuration] = useState('5');

  const handleSubmit = () => {
    if (!videoFile || !imageFile) return;
    const fd = new FormData();
    fd.append('video', videoFile);
    fd.append('image', imageFile);
    fd.append('prompt', prompt);
    fd.append('replaceType', replaceType);
    fd.append('duration', duration);
    onSubmit(fd);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-nexus-muted font-bold mb-1.5 block">参考视频 *</label>
          {!videoFile ? (
            <DragDropZone accept="video/*" label="视频" hint="MP4 / MOV" onFile={setVideoFile} />
          ) : (
            <FilePreview name={videoFile.name} onRemove={() => setVideoFile(null)} />
          )}
        </div>
        <div>
          <label className="text-[10px] text-nexus-muted font-bold mb-1.5 block">模特图 *</label>
          {!imageFile ? (
            <DragDropZone accept="image/*" label="图片" hint="JPG / PNG" onFile={setImageFile} />
          ) : (
            <FilePreview name={imageFile.name} onRemove={() => setImageFile(null)} />
          )}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-nexus-muted font-bold mb-1.5 block">提示词</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} placeholder="描述替换后的效果，如：美女在跳舞..."
          className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-lg px-3 py-2 text-xs text-nexus-text placeholder-nexus-muted/30 focus:border-[#A78BFA]/50 outline-none resize-none" />
      </div>

      <OptionGroup label="替换类型" options={REPLACE_TYPE_OPTIONS} value={replaceType} onChange={setReplaceType} columns={3} />

      <div>
        <label className="text-[10px] text-nexus-muted font-bold mb-1.5 block">视频时长: {duration}s</label>
        <input type="range" min="1" max="30" value={duration} onChange={(e) => setDuration(e.target.value)}
          className="w-full accent-[#A78BFA]" />
        <div className="flex justify-between text-[9px] text-nexus-muted/50"><span>1s</span><span>30s</span></div>
      </div>

      <button onClick={handleSubmit} disabled={!videoFile || !imageFile}
        className="cursor-target w-full h-11 bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] text-white font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <UserRoundCog size={15} /> 开始角色替换
      </button>
    </div>
  );
}

/** 动作迁移表单 */
function MotionTransferForm({ onSubmit }: { onSubmit: (fd: FormData) => void }) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [skipSeconds, setSkipSeconds] = useState('0');
  const [totalDuration, setTotalDuration] = useState('10');
  const [resolution, setResolution] = useState('3');
  const [fps] = useState('30');
  const [ecommCoeff, setEcommCoeff] = useState('0.1');
  const [encryption, setEncryption] = useState('2');
  const [enableFace, setEnableFace] = useState(true);
  const [expressionStr, setExpressionStr] = useState('0.8');
  const [seed, setSeed] = useState('49');

  const handleSubmit = () => {
    if (!videoFile || !imageFile) return;
    const fd = new FormData();
    fd.append('video', videoFile);
    fd.append('image', imageFile);
    fd.append('skipSeconds', skipSeconds);
    fd.append('totalDuration', totalDuration);
    fd.append('resolution', resolution);
    fd.append('fps', fps);
    fd.append('ecommerceCoeff', ecommCoeff);
    fd.append('encryption', encryption);
    fd.append('enableFaceMimic', String(enableFace));
    fd.append('expressionStrength', expressionStr);
    fd.append('randomSeed', seed);
    onSubmit(fd);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-nexus-muted font-bold mb-1.5 block">模仿视频 *</label>
          {!videoFile ? (
            <DragDropZone accept="video/*" label="视频" hint="清晰的参考视频" onFile={setVideoFile} />
          ) : (
            <FilePreview name={videoFile.name} onRemove={() => setVideoFile(null)} />
          )}
        </div>
        <div>
          <label className="text-[10px] text-nexus-muted font-bold mb-1.5 block">形象图片 *</label>
          {!imageFile ? (
            <DragDropZone accept="image/*" label="图片" hint="高像素人物图" onFile={setImageFile} />
          ) : (
            <FilePreview name={imageFile.name} onRemove={() => setImageFile(null)} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-nexus-muted font-bold mb-1 block">跳过秒数: {skipSeconds}s</label>
          <input type="range" min="0" max="30" value={skipSeconds} onChange={(e) => setSkipSeconds(e.target.value)} className="w-full accent-[#F472B6]" />
        </div>
        <div>
          <label className="text-[10px] text-nexus-muted font-bold mb-1 block">总时长: {totalDuration}s</label>
          <input type="range" min="1" max="30" value={totalDuration} onChange={(e) => setTotalDuration(e.target.value)} className="w-full accent-[#F472B6]" />
        </div>
      </div>

      <OptionGroup label="分辨率" options={RESOLUTION_OPTIONS} value={resolution} onChange={setResolution} columns={2} />

      <CollapsibleSection title="高级参数">
        <div>
          <label className="text-[10px] text-nexus-muted mb-1 block">电商系数: {ecommCoeff}</label>
          <input type="range" min="0" max="1" step="0.05" value={ecommCoeff} onChange={(e) => setEcommCoeff(e.target.value)} className="w-full accent-[#F472B6]" />
        </div>
        <OptionGroup label="加密方式" options={[
          { value: '2', label: '正常输出' }, { value: '1', label: 'ZIP 加密' },
        ]} value={encryption} onChange={setEncryption} columns={2} />
        <ToggleSwitch label="人脸表情模仿" value={enableFace} onChange={setEnableFace} />
        {enableFace && (
          <div>
            <label className="text-[10px] text-nexus-muted mb-1 block">表情强度: {expressionStr}</label>
            <input type="range" min="0" max="1" step="0.05" value={expressionStr} onChange={(e) => setExpressionStr(e.target.value)} className="w-full accent-[#F472B6]" />
          </div>
        )}
        <div>
          <label className="text-[10px] text-nexus-muted mb-1 block">随机种子</label>
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)}
            className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-lg px-3 py-2 text-xs text-nexus-text focus:border-[#F472B6]/50 outline-none" />
        </div>
      </CollapsibleSection>

      <button onClick={handleSubmit} disabled={!videoFile || !imageFile}
        className="cursor-target w-full h-11 bg-gradient-to-r from-[#F472B6] to-[#EC4899] text-white font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(244,114,182,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
        <Move3d size={15} /> 开始动作迁移
      </button>
    </div>
  );
}
