import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Upload, X, Play, Loader2, CheckCircle2, AlertTriangle,
  RotateCcw, Download, ChevronDown, ChevronUp, Archive, ExternalLink,
} from 'lucide-react';

// ==================== 类型 ====================

export interface PersistedTask {
  taskId: string;
  status: 'uploading' | 'processing' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  resultUrl?: string;
  results?: Array<{ url: string; outputType: string; text?: string | null }>;
  errorMessage?: string;
  timestamp: number;
  appType: string;
}

// ==================== 通用子组件 ====================

/** 拖拽上传区域 */
export function DragDropZone({
  accept, label, hint, onFile, children,
}: {
  accept: string; label: string; hint: string;
  onFile: (f: File) => void; children?: React.ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <label
      className={`cursor-target min-h-[160px] flex flex-col items-center justify-center bg-nexus-bg/30 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
        dragOver ? 'border-nexus-primary/60 bg-nexus-primary/[0.05]' : 'border-nexus-border/40 hover:border-nexus-primary/40'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={accept}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        className="absolute w-0 h-0 opacity-0 overflow-hidden" />
      {children || (
        <>
          <div className="w-12 h-12 rounded-xl bg-nexus-surface/50 border border-nexus-border/40 flex items-center justify-center mb-2">
            <Upload size={20} className="text-nexus-muted/50" />
          </div>
          <p className="text-xs text-nexus-muted">
            拖放或 <span className="text-nexus-primary font-medium">点击上传</span> {label}
          </p>
          <p className="text-[10px] text-nexus-muted/40 mt-1">{hint}</p>
        </>
      )}
    </label>
  );
}

/** 文件预览条 */
export function FilePreview({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-nexus-bg/40 border border-nexus-border/30 rounded-xl px-3 py-2">
      <Play size={12} className="text-nexus-primary shrink-0" />
      <span className="text-xs text-nexus-text truncate flex-1">{name}</span>
      <button onClick={onRemove} className="cursor-target text-nexus-muted hover:text-red-400 shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

/** 任务进度指示器 */
export function TaskProgress({ label, taskId, status }: {
  label: string; taskId: string; status: string;
}) {
  const statusText = status === 'QUEUED' ? '排队中...' : status === 'RUNNING' ? '处理中...' : '提交中...';
  return (
    <div className="bg-nexus-surface/30 border border-nexus-primary/10 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Loader2 size={18} className="text-nexus-primary animate-spin" />
        <div>
          <p className="text-sm font-bold text-nexus-text">{label} · {statusText}</p>
          <p className="text-[10px] text-nexus-muted mt-0.5">预计需要 2-8 分钟 · {taskId.slice(0, 8)}...</p>
        </div>
      </div>
      <div className="w-full h-1.5 bg-nexus-bg rounded-full overflow-hidden">
        <motion.div className="h-full bg-gradient-to-r from-nexus-primary to-nexus-secondary rounded-full"
          initial={{ width: '5%' }} animate={{ width: status === 'RUNNING' ? '60%' : '25%' }}
          transition={{ duration: 20, ease: 'easeInOut' }} />
      </div>
    </div>
  );
}

/** 任务结果展示 */
export function TaskResult({ results, onReset }: {
  results: PersistedTask['results']; onReset: () => void;
}) {
  if (!results || results.length === 0) return null;
  const videos = results.filter(r => r.outputType === 'mp4' || r.outputType === 'gif');
  const images = results.filter(r => ['png', 'jpg', 'jpeg', 'webp'].includes(r.outputType));
  const texts = results.filter(r => r.text);
  // NOTE: ZIP 等压缩包类型 — 动作迁移加密模式会输出 ZIP
  const archives = results.filter(r =>
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(r.outputType) && r.url
  );
  // 非上述类型但有 URL 的其他文件（兜底）
  const others = results.filter(r =>
    r.url &&
    !['mp4', 'gif', 'png', 'jpg', 'jpeg', 'webp', 'zip', 'rar', '7z', 'tar', 'gz'].includes(r.outputType) &&
    !r.text
  );

  /** 跳转到资产库 */
  const goToAssets = () => {
    window.dispatchEvent(
      new CustomEvent('navigate-to-tab', { detail: { tab: 'assets' } }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <CheckCircle2 size={14} className="text-emerald-400" />
        <span className="text-xs font-bold text-nexus-text">生成完成</span>
        <button onClick={onReset}
          className="cursor-target ml-auto flex items-center gap-1 text-[10px] text-nexus-muted hover:text-nexus-primary">
          <RotateCcw size={10} /> 重新生成
        </button>
      </div>

      {/* 视频预览 */}
      {videos.map((v, i) => (
        <div key={i} className="rounded-xl overflow-hidden border border-nexus-border/30 bg-nexus-bg/30">
          <video src={v.url} controls className="w-full max-h-[300px]" />
          <div className="flex items-center justify-between px-3 py-2 bg-nexus-surface/30">
            <span className="text-[10px] text-nexus-muted">视频 {i + 1}</span>
            <a href={v.url} download target="_blank" rel="noreferrer"
              className="cursor-target flex items-center gap-1 text-[10px] text-nexus-primary hover:text-nexus-primary/80">
              <Download size={10} /> 下载
            </a>
          </div>
        </div>
      ))}

      {/* 图片预览 */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((img, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-nexus-border/30 bg-nexus-bg/30">
              <img src={img.url} alt={`结果${i + 1}`} className="w-full object-contain max-h-[200px]" />
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[9px] text-nexus-muted">图片 {i + 1}</span>
                <a href={img.url} download target="_blank" rel="noreferrer"
                  className="cursor-target text-[9px] text-nexus-primary"><Download size={9} /></a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 压缩包下载 — ZIP 等不可预览文件 */}
      {archives.map((a, i) => (
        <div key={`archive-${i}`} className="rounded-xl border border-nexus-border/30 bg-nexus-bg/30 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center">
              <Archive size={18} className="text-[#F59E0B]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-nexus-text">压缩包文件</p>
              <p className="text-[10px] text-nexus-muted truncate">类型: {a.outputType.toUpperCase()} · 点击下方按钮下载</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={a.url} download target="_blank" rel="noreferrer"
              className="cursor-target flex-1 h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/25 transition-all">
              <Download size={13} /> 下载压缩包
            </a>
            <button onClick={goToAssets}
              className="cursor-target flex-1 h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg bg-nexus-primary/10 border border-nexus-primary/20 text-nexus-primary hover:bg-nexus-primary/20 transition-all">
              <ExternalLink size={12} /> 前往资产库
            </button>
          </div>
        </div>
      ))}

      {/* 其他不可预览文件（兜底） */}
      {others.map((o, i) => (
        <div key={`other-${i}`} className="rounded-xl border border-nexus-border/30 bg-nexus-bg/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Download size={14} className="text-nexus-muted shrink-0" />
            <span className="text-xs text-nexus-text truncate">文件 ({o.outputType || '未知格式'})</span>
          </div>
          <a href={o.url} download target="_blank" rel="noreferrer"
            className="cursor-target flex items-center gap-1 text-[10px] text-nexus-primary hover:text-nexus-primary/80 shrink-0">
            <Download size={10} /> 下载
          </a>
        </div>
      ))}

      {/* 文本输出 */}
      {texts.map((t, i) => (
        <div key={i} className="bg-nexus-bg/30 border border-nexus-border/30 rounded-xl px-3 py-2">
          <p className="text-[10px] text-nexus-muted mb-1">AI 提示词</p>
          <p className="text-xs text-nexus-text leading-relaxed">{t.text}</p>
        </div>
      ))}

      {/* 资产库提示 — 所有结果已同步 */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] text-nexus-muted/60">所有结果已同步至资产库</span>
        <button onClick={goToAssets}
          className="cursor-target text-[10px] text-nexus-primary/60 hover:text-nexus-primary flex items-center gap-1 transition-colors">
          查看 <ExternalLink size={9} />
        </button>
      </div>
    </div>
  );
}

/** 任务失败展示 */
export function TaskFailed({ message, onRetry }: { message?: string; onRetry: () => void }) {
  // NOTE: RunningHub OOM 错误的 exception_message 包含 → 前缀的建议项
  // 将其解析为结构化展示，方便用户快速理解和操作
  const isOom = message?.includes('显存') || message?.includes('OutOfMemory');
  const suggestions = message
    ? message.split('\n').filter((line) => line.trim().startsWith('→')).map((l) => l.trim().replace(/^→\s*/, ''))
    : [];
  // 提取首行作为错误标题（如「显存不足告警」）
  const titleMatch = message?.match(/【(.+?)】/);
  const errorTitle = titleMatch ? titleMatch[1] : '生成失败';

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className={isOom ? 'text-amber-400' : 'text-red-400'} />
        <span className={`text-xs font-bold ${isOom ? 'text-amber-400' : 'text-red-400'}`}>
          {errorTitle}
        </span>
      </div>

      {/* OOM 错误展示结构化建议 */}
      {isOom && suggestions.length > 0 ? (
        <div className="space-y-1.5 pl-1">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-nexus-text/70">
              <span className="text-amber-400/70 shrink-0 mt-px">•</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      ) : (
        message && <p className="text-[11px] text-red-400/70 leading-relaxed whitespace-pre-line">{message}</p>
      )}

      {/* NOTE: 明确告知用户失败不扣费，降低用户焦虑 */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/8 border border-emerald-500/15 rounded-lg">
        <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
        <span className="text-[10px] text-emerald-400/80">本次任务未扣除积分，重试不会额外收费</span>
      </div>

      <button onClick={onRetry}
        className="cursor-target flex items-center gap-1.5 text-xs text-nexus-muted hover:text-nexus-text">
        <RotateCcw size={11} /> 调整参数后重试
      </button>
    </div>
  );
}

/** 开关组件 */
export function ToggleSwitch({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-nexus-muted">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`cursor-target w-10 h-5 rounded-full transition-all relative ${
          value
            ? 'bg-nexus-primary/40 border border-nexus-primary/60 shadow-[0_0_8px_rgba(62,237,231,0.25)]'
            : 'bg-nexus-surface border border-nexus-border/50'
        }`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
          value ? 'left-5 bg-nexus-primary shadow-[0_0_6px_rgba(62,237,231,0.4)]' : 'left-0.5 bg-nexus-muted/70'
        }`} />
      </button>
    </div>
  );
}

/** 选项按钮组 */
export function OptionGroup({ label, options, value, onChange, columns = 4 }: {
  label: string;
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <div>
      <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider mb-2 block">{label}</label>
      <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {options.map((o) => (
          <button key={o.value} onClick={() => onChange(o.value)}
            className={`cursor-target px-2 py-2 rounded-lg text-xs text-center transition-all ${
              value === o.value
                ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30'
                : 'bg-nexus-bg/30 text-nexus-muted border border-nexus-border/30 hover:text-nexus-text'
            }`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 可折叠面板 */
export function CollapsibleSection({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-nexus-border/30 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="cursor-target w-full flex items-center justify-between px-3 py-2 bg-nexus-surface/20 text-xs text-nexus-muted hover:text-nexus-text">
        {title}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="p-3 space-y-3">{children}</div>}
    </div>
  );
}
