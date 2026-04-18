import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileVideo,
  Loader2,
  Sparkles,
  CheckCircle2,
  X,
  Copy,
  Check,
  ChevronRight,
  Play,
  Download,
  Clock,
  Film,
  Maximize,
  Zap,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';
import { CREDIT_VIRAL_CONTENT } from './factory-credits';

/**
 * 爆款拆解复刻工具组件
 * NOTE: 两阶段式交互 —
 *   阶段一：上传视频 → 反推提示词（流式展示）
 *   阶段二：提示词 + 参数 → 复刻爆款视频（长时间等待）
 */

// 本地存储 Key — 用于任务持久化（导航离开后恢复轮询）
const STORAGE_KEY_PHASE1 = 'viral-content-phase1-task';
const STORAGE_KEY_PHASE2 = 'viral-content-phase2-task';

// 轮询间隔 (ms)
const POLL_INTERVAL = 4000;

/** 比例选项（经验证：1=1:1, 2=3:4, 3=4:3, 4=9:16, 5=16:9） */
const RATIO_OPTIONS = [
  { value: '5', label: '16:9', desc: '横屏' },
  { value: '4', label: '9:16', desc: '竖屏' },
  { value: '3', label: '4:3', desc: '经典' },
  { value: '2', label: '3:4', desc: '竖版' },
  { value: '1', label: '1:1', desc: '方形' },
];

/** 时长选项 */
const DURATION_OPTIONS = ['3', '4', '5', '6', '7', '8', '10'];

export default function ViralContentTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  // ─── 阶段控制 ───
  const [currentPhase, setCurrentPhase] = useState<1 | 2>(1);

  // ─── 第一阶段状态 ───
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [phase1TaskId, setPhase1TaskId] = useState('');
  const [phase1Status, setPhase1Status] = useState<'idle' | 'uploading' | 'processing' | 'streaming' | 'done' | 'error'>('idle');
  const [promptText, setPromptText] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [copied, setCopied] = useState(false);

  // ─── 第二阶段状态 ───
  const [editablePrompt, setEditablePrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [quality, setQuality] = useState('2');
  const [ratio, setRatio] = useState('4');
  const [phase2TaskId, setPhase2TaskId] = useState('');
  const [phase2Status, setPhase2Status] = useState<'idle' | 'submitting' | 'processing' | 'done' | 'error'>('idle');
  const [videoUrl, setVideoUrl] = useState('');
  const [phase2Error, setPhase2Error] = useState('');

  // ─── 通用 ───
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phase1PollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phase2PollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // NOTE: 防止 setInterval 异步竞态导致 completed 分支重入（重复扣费）
  const completedRef = useRef<{ phase1: boolean; phase2: boolean }>({ phase1: false, phase2: false });

  // ─── 任务持久化：组件挂载时恢复 ───
  useEffect(() => {
    // 恢复第一阶段
    const saved1 = scopedStorage.getItem(STORAGE_KEY_PHASE1);
    if (saved1) {
      try {
        const task = JSON.parse(saved1);
        if (task.taskId && task.status === 'processing') {
          setPhase1TaskId(task.taskId);
          setPhase1Status('processing');
          startPhase1Poll(task.taskId);
        } else if (task.status === 'done' && task.promptText) {
          setPromptText(task.promptText);
          setStreamedText(task.promptText);
          setPhase1Status('done');
        }
      } catch { /* ignore */ }
    }

    // 恢复第二阶段
    const saved2 = scopedStorage.getItem(STORAGE_KEY_PHASE2);
    if (saved2) {
      try {
        const task = JSON.parse(saved2);
        if (task.taskId && task.status === 'processing') {
          setCurrentPhase(2);
          setPhase2TaskId(task.taskId);
          setPhase2Status('processing');
          if (task.prompt) setEditablePrompt(task.prompt);
          startPhase2Poll(task.taskId);
        } else if (task.status === 'done' && task.videoUrl) {
          setCurrentPhase(2);
          setVideoUrl(task.videoUrl);
          setPhase2Status('done');
          if (task.prompt) setEditablePrompt(task.prompt);
        }
      } catch { /* ignore */ }
    }

    return () => {
      if (phase1PollRef.current) clearInterval(phase1PollRef.current);
      if (phase2PollRef.current) clearInterval(phase2PollRef.current);
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 第一阶段轮询 ───
  const startPhase1Poll = useCallback((taskId: string) => {
    if (phase1PollRef.current) clearInterval(phase1PollRef.current);
    completedRef.current.phase1 = false;
    phase1PollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/viral-content/task/${taskId}`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (data.status === 'SUCCESS') {
          // GUARD: 防止异步竞态重入，避免 consumeCredits 被调用两次
          if (completedRef.current.phase1) return;
          completedRef.current.phase1 = true;
          if (phase1PollRef.current) clearInterval(phase1PollRef.current);
          const text = data.resultText || '';
          setPromptText(text);
          // 保存完成状态到 localStorage
          scopedStorage.setItem(STORAGE_KEY_PHASE1, JSON.stringify({
            taskId,
            status: 'done',
            promptText: text,
          }));

          // NOTE: 同步写入资产库和历史记录 — 反推提示词本身也是一次有价值的产出
          const now = Date.now();
          const dateStr = new Date(now).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          });
          // NOTE: 将文本内容编码为 data URI，确保资产库可直接下载
          const textDataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          addAssetRecordWithSize({
            id: `viral-prompt-${taskId}`,
            name: `反推提示词_${taskId.slice(0, 8)}.txt`,
            source: '数字工厂-爆款复刻',
            type: 'text',
            size: `${text.length} 字`,
            date: dateStr,
            downloadUrl: textDataUrl,
            toolId: 'viral-content',
          });
          addHistoryRecord({
            id: `history-viral-prompt-${taskId}`,
            toolName: '爆款拆解复刻',
            action: '反推提示词',
            status: 'success',
            time: new Date(now).toISOString(),
            duration: '-',
            output: `已反推提示词（${text.length} 字），可用于爆款视频复刻。`,
          });

          // NOTE: 反推提示词成功后扣除积分
          await consumeCredits(CREDIT_VIRAL_CONTENT.prompt, '爆款复刻-反推提示词');

          // 触发流式输出
          startStreamOutput(text);
        } else if (data.status === 'FAILED') {
          if (phase1PollRef.current) clearInterval(phase1PollRef.current);
          setPhase1Status('error');
          setError(data.errorMessage || '反推提示词失败');
          scopedStorage.removeItem(STORAGE_KEY_PHASE1);
        }
        // QUEUED / RUNNING 继续轮询
      } catch { /* ignore network errors, will retry */ }
    }, POLL_INTERVAL);
  }, []);

  // ─── 流式输出效果 ───
  const startStreamOutput = useCallback((fullText: string) => {
    setPhase1Status('streaming');
    setStreamedText('');
    let idx = 0;
    // NOTE: 模拟流式输出 — 每次追加多个字符提高速度感
    const chunkSize = 3;
    streamTimerRef.current = setInterval(() => {
      idx += chunkSize;
      if (idx >= fullText.length) {
        setStreamedText(fullText);
        setPhase1Status('done');
        if (streamTimerRef.current) clearInterval(streamTimerRef.current);
      } else {
        setStreamedText(fullText.slice(0, idx));
      }
    }, 30);
  }, []);

  // ─── 第二阶段轮询 ───
  const startPhase2Poll = useCallback((taskId: string) => {
    if (phase2PollRef.current) clearInterval(phase2PollRef.current);
    completedRef.current.phase2 = false;
    phase2PollRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/viral-content/task/${taskId}`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (data.status === 'SUCCESS') {
          // GUARD: 防止异步竞态重入，避免 consumeCredits 被调用两次
          if (completedRef.current.phase2) return;
          completedRef.current.phase2 = true;
          if (phase2PollRef.current) clearInterval(phase2PollRef.current);
          const resultVideoUrl = data.resultUrl || '';
          setVideoUrl(resultVideoUrl);
          setPhase2Status('done');
          scopedStorage.setItem(STORAGE_KEY_PHASE2, JSON.stringify({
            taskId,
            status: 'done',
            videoUrl: resultVideoUrl,
            prompt: editablePrompt,
          }));

          // NOTE: 同步写入资产库和历史记录
          const now = Date.now();
          const dateStr = new Date(now).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          });
          addAssetRecordWithSize({
            id: `viral-${taskId}`,
            name: `爆款复刻视频_${taskId.slice(0, 8)}.mp4`,
            source: '数字工厂-爆款复刻',
            type: 'video',
            size: '-',
            date: dateStr,
            downloadUrl: resultVideoUrl,
            toolId: 'viral-content',
          });
          addHistoryRecord({
            id: `history-viral-${taskId}`,
            toolName: '爆款拆解复刻',
            action: '复刻爆款视频',
            status: 'success',
            time: new Date(now).toISOString(),
            duration: '-',
            output: `已生成爆款复刻视频，已保存至资产库。`,
          });

          // NOTE: 复刻视频成功后扣除积分
          await consumeCredits(CREDIT_VIRAL_CONTENT.video, '爆款复刻-视频生成');
        } else if (data.status === 'FAILED') {
          if (phase2PollRef.current) clearInterval(phase2PollRef.current);
          setPhase2Status('error');
          setPhase2Error(data.errorMessage || '视频生成失败');
          scopedStorage.removeItem(STORAGE_KEY_PHASE2);
        }
      } catch { /* retry */ }
    }, POLL_INTERVAL);
  }, [editablePrompt]);

  // ─── 文件处理 ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (!selected.type.startsWith('video/')) {
        setError('请上传视频文件（MP4、MOV 等格式）');
        return;
      }
      setFile(selected);
      setError('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      if (!dropped.type.startsWith('video/')) {
        setError('请上传视频文件（MP4、MOV 等格式）');
        return;
      }
      setFile(dropped);
      setError('');
    }
  };

  // ─── 第一阶段提交 ───
  const handlePhase1Submit = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_VIRAL_CONTENT.prompt, '爆款反推提示词')) return;
    if (!file) {
      setError('请先上传视频文件');
      return;
    }
    setPhase1Status('uploading');
    setError('');
    setPromptText('');
    setStreamedText('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await fetch('/api/viral-content/phase1/submit', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.detail || '提交失败');
      }
      const data = await resp.json();
      const taskId = data.taskId;
      setPhase1TaskId(taskId);
      setPhase1Status('processing');

      // 立即持久化 taskId
      scopedStorage.setItem(STORAGE_KEY_PHASE1, JSON.stringify({
        taskId,
        status: 'processing',
      }));

      startPhase1Poll(taskId);
    } catch (err) {
      setPhase1Status('error');
      setError(err instanceof Error ? err.message : '请求失败');
    }
  };

  // ─── 复制提示词 ───
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback not needed for modern browsers */ }
  };

  // ─── 使用提示词进入第二阶段 ───
  const handleUsePrompt = () => {
    setEditablePrompt(promptText);
    setCurrentPhase(2);
    setPhase2Status('idle');
    setVideoUrl('');
    setPhase2Error('');
  };

  // ─── 第二阶段提交 ───
  const handlePhase2Submit = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_VIRAL_CONTENT.video, '爆款视频复刻')) return;
    if (!editablePrompt.trim()) {
      setPhase2Error('请输入提示词');
      return;
    }
    setPhase2Status('submitting');
    setPhase2Error('');
    setVideoUrl('');

    const formData = new FormData();
    formData.append('prompt', editablePrompt);
    formData.append('duration', duration);
    formData.append('quality', quality);
    formData.append('ratio', ratio);

    try {
      const resp = await fetch('/api/viral-content/phase2/submit', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.detail || '提交失败');
      }
      const data = await resp.json();
      const taskId = data.taskId;
      setPhase2TaskId(taskId);
      setPhase2Status('processing');

      // 立即持久化 taskId
      scopedStorage.setItem(STORAGE_KEY_PHASE2, JSON.stringify({
        taskId,
        status: 'processing',
        prompt: editablePrompt,
      }));

      startPhase2Poll(taskId);
    } catch (err) {
      setPhase2Status('error');
      setPhase2Error(err instanceof Error ? err.message : '请求失败');
    }
  };

  // ─── 重置第一阶段 ───
  const handleReset = () => {
    if (phase1PollRef.current) clearInterval(phase1PollRef.current);
    if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    setFile(null);
    setPhase1TaskId('');
    setPhase1Status('idle');
    setPromptText('');
    setStreamedText('');
    setError('');
    scopedStorage.removeItem(STORAGE_KEY_PHASE1);
  };

  // ─── 切换阶段视图（不中断后台轮询） ───
  const handleSwitchToPhase1 = () => {
    // NOTE: 仅切换视图，不清除 phase2 的轮询和状态
    setCurrentPhase(1);
  };

  const handleSwitchToPhase2 = () => {
    // NOTE: 允许在第二阶段有任务时随时切回查看
    setCurrentPhase(2);
  };

  const isPhase1Busy = phase1Status === 'uploading' || phase1Status === 'processing' || phase1Status === 'streaming';

  return (
    <div className="space-y-6">
      {/* ═══ 阶段指示器 ═══ */}
      <div className="flex items-center gap-3">
        {/* Step 1 */}
        <button
          onClick={handleSwitchToPhase1}
          className={`cursor-target flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            currentPhase === 1
              ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30 shadow-[0_0_15px_rgba(62,237,231,0.15)]'
              : 'bg-nexus-surface text-nexus-muted border border-nexus-border hover:text-nexus-text'
          }`}
        >
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
            currentPhase === 1 ? 'bg-nexus-primary text-nexus-inverse' : phase1Status === 'done' ? 'bg-nexus-secondary text-nexus-inverse' : 'bg-nexus-border text-nexus-muted'
          }`}>
            {phase1Status === 'done' ? <Check size={10} /> : '1'}
          </div>
          反推提示词
        </button>

        <ChevronRight size={14} className="text-nexus-border" />

        {/* Step 2 — 可点击切换回第二阶段 */}
        <button
          onClick={handleSwitchToPhase2}
          className={`cursor-target flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            currentPhase === 2
              ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30 shadow-[0_0_15px_rgba(62,237,231,0.15)]'
              : phase2Status !== 'idle'
                ? 'bg-nexus-surface text-nexus-muted border border-nexus-border hover:text-nexus-text'
                : 'bg-nexus-surface text-nexus-muted/50 border border-nexus-border/50'
          }`}
        >
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
            currentPhase === 2 ? 'bg-nexus-primary text-nexus-inverse' : phase2Status === 'done' ? 'bg-nexus-secondary text-nexus-inverse' : phase2Status === 'processing' ? 'bg-nexus-primary/50 text-nexus-inverse' : 'bg-nexus-border/50 text-nexus-muted/50'
          }`}>
            {phase2Status === 'done' ? <Check size={10} /> : phase2Status === 'processing' ? <Loader2 size={10} className="animate-spin" /> : '2'}
          </div>
          爆款视频复刻
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════
           第一阶段：反推提示词
         ═══════════════════════════════════════════════════════ */}
      {currentPhase === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* 上传区域 — 支持拖拽 */}
          <div
            className={`cursor-target relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
              isDragOver
                ? 'border-nexus-primary bg-nexus-primary/5 shadow-[0_0_30px_rgba(62,237,231,0.15)]'
                : file
                ? 'border-nexus-secondary/50 bg-nexus-surface/80'
                : 'border-nexus-border bg-nexus-surface/50 hover:border-nexus-primary/30 hover:bg-nexus-surface/70'
            }`}
            onClick={() => !file && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {file ? (
              <div className="flex items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
                  <FileVideo size={24} className="text-nexus-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-nexus-text">{file.name}</p>
                  <p className="text-[11px] text-nexus-muted mt-0.5">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · 视频文件
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReset();
                  }}
                  disabled={isPhase1Busy}
                  className="cursor-target ml-4 p-2 text-nexus-muted hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-nexus-primary/5 border border-nexus-primary/10 flex items-center justify-center mx-auto">
                  <Upload size={28} className={isDragOver ? 'text-nexus-primary' : 'text-nexus-muted/50'} />
                </div>
                <div>
                  <p className="text-sm text-nexus-text">
                    拖放视频文件到此处，或 <span className="text-nexus-primary cursor-pointer hover:underline">点击选择</span>
                  </p>
                  <p className="text-[11px] text-nexus-muted/60 mt-1.5">支持 MP4、MOV、AVI 等视频格式</p>
                </div>
              </div>
            )}

            {/* 拖拽时的发光边框动画 */}
            {isDragOver && (
              <motion.div
                className="absolute inset-0 rounded-2xl border-2 border-nexus-primary pointer-events-none"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              />
            )}
          </div>

          {/* 提交按钮 */}
          {phase1Status === 'idle' && (
            <div className="flex items-center justify-end">
              <button
                onClick={handlePhase1Submit}
                disabled={!file}
                className="cursor-target px-6 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Sparkles size={16} />
                开始反推提示词
              </button>
            </div>
          )}

          {/* 上传/处理中 */}
          {(phase1Status === 'uploading' || phase1Status === 'processing') && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-nexus-surface border border-nexus-primary/20 rounded-2xl p-6"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-nexus-primary/10 flex items-center justify-center">
                    <Loader2 size={20} className="text-nexus-primary animate-spin" />
                  </div>
                  {/* 呼吸灯 */}
                  <motion.div
                    className="absolute inset-0 rounded-xl border border-nexus-primary/30"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-nexus-text">
                    {phase1Status === 'uploading' ? '正在上传视频...' : 'AI 正在分析视频内容...'}
                  </p>
                  <p className="text-[11px] text-nexus-muted mt-0.5">
                    {phase1Status === 'uploading' ? '上传中，请勿关闭页面' : `任务 ID: ${phase1TaskId.slice(0, 12)}...`}
                  </p>
                </div>
              </div>
              {/* 进度条动画 */}
              <div className="mt-4 w-full h-1.5 bg-nexus-bg rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-nexus-primary to-nexus-secondary rounded-full"
                  animate={{ width: phase1Status === 'uploading' ? ['0%', '30%'] : ['30%', '80%'] }}
                  transition={{ duration: phase1Status === 'uploading' ? 3 : 30, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          )}

          {/* 流式输出 + 完成状态 */}
          {(phase1Status === 'streaming' || phase1Status === 'done') && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* 提示词结果展示 */}
              <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-nexus-border">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-nexus-primary" />
                    <span className="text-xs font-bold text-nexus-text">反推提示词结果</span>
                    {phase1Status === 'streaming' && (
                      <motion.span
                        className="text-[10px] text-nexus-primary bg-nexus-primary/10 px-2 py-0.5 rounded-full"
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      >
                        输出中...
                      </motion.span>
                    )}
                  </div>
                  {phase1Status === 'done' && (
                    <button
                      onClick={handleCopy}
                      className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/20 hover:bg-nexus-primary/20 transition-all"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? '已复制' : '一键复制'}
                    </button>
                  )}
                </div>
                <div className="p-5 max-h-[400px] overflow-y-auto">
                  <p className="text-sm text-nexus-text/90 whitespace-pre-wrap leading-relaxed font-mono">
                    {streamedText}
                    {phase1Status === 'streaming' && (
                      <motion.span
                        className="inline-block w-0.5 h-4 bg-nexus-primary ml-0.5 align-middle"
                        animate={{ opacity: [1, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                      />
                    )}
                  </p>
                </div>
              </div>

              {/* 操作按钮 */}
              {phase1Status === 'done' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between"
                >
                  <button
                    onClick={handleReset}
                    className="cursor-target flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-nexus-muted bg-nexus-surface border border-nexus-border rounded-xl hover:text-nexus-text hover:border-nexus-muted/50 transition-all"
                  >
                    <RotateCcw size={14} />
                    重新上传
                  </button>
                  <button
                    onClick={handleUsePrompt}
                    className="cursor-target flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all"
                  >
                    <Zap size={16} />
                    使用该提示词一键复刻
                    <ChevronRight size={16} />
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* 错误提示 */}
          <AnimatePresence>
            {error && phase1Status !== 'done' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400"
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════
           第二阶段：爆款视频复刻
         ═══════════════════════════════════════════════════════ */}
      {currentPhase === 2 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-5"
        >
          {/* 提示词编辑区 */}
          {(phase2Status === 'idle' || phase2Status === 'submitting') && (
            <>
              <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 space-y-4">
                <label className="text-xs font-bold text-nexus-text flex items-center gap-2">
                  <Sparkles size={12} className="text-nexus-primary" />
                  视频提示词
                </label>
                <textarea
                  value={editablePrompt}
                  onChange={(e) => setEditablePrompt(e.target.value)}
                  placeholder="输入或粘贴视频生成提示词..."
                  rows={6}
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/40 outline-none focus:border-nexus-primary/50 focus:shadow-[0_0_10px_rgba(62,237,231,0.1)] transition-all resize-none"
                />
              </div>

              {/* 参数设置区 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 时长 */}
                <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4">
                  <label className="text-[11px] text-nexus-muted mb-3 flex items-center gap-1.5">
                    <Clock size={11} />
                    视频时长（秒）
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDuration(d)}
                        className={`cursor-target px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          duration === d
                            ? 'bg-nexus-primary text-nexus-inverse'
                            : 'bg-nexus-bg text-nexus-muted border border-nexus-border hover:text-nexus-text hover:border-nexus-muted/50'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* 清晰度 */}
                <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4">
                  <label className="text-[11px] text-nexus-muted mb-3 flex items-center gap-1.5">
                    <Film size={11} />
                    清晰度
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: '1', label: '高清版', desc: '质量优先' },
                      { value: '2', label: '极速版', desc: '速度优先' },
                    ].map((q) => (
                      <button
                        key={q.value}
                        onClick={() => setQuality(q.value)}
                        className={`cursor-target flex-1 px-3 py-2.5 rounded-lg text-center transition-all ${
                          quality === q.value
                            ? 'bg-nexus-primary text-nexus-inverse'
                            : 'bg-nexus-bg text-nexus-muted border border-nexus-border hover:text-nexus-text hover:border-nexus-muted/50'
                        }`}
                      >
                        <div className="text-xs font-bold">{q.label}</div>
                        <div className={`text-[9px] mt-0.5 ${quality === q.value ? 'text-nexus-inverse/60' : 'text-nexus-muted/60'}`}>
                          {q.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 比例 */}
                <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-4">
                  <label className="text-[11px] text-nexus-muted mb-3 flex items-center gap-1.5">
                    <Maximize size={11} />
                    画面比例
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {RATIO_OPTIONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setRatio(r.value)}
                        className={`cursor-target px-3 py-2 rounded-lg text-center transition-all ${
                          ratio === r.value
                            ? 'bg-nexus-primary text-nexus-inverse'
                            : 'bg-nexus-bg text-nexus-muted border border-nexus-border hover:text-nexus-text hover:border-nexus-muted/50'
                        }`}
                      >
                        <div className="text-xs font-bold">{r.label}</div>
                        <div className={`text-[9px] ${ratio === r.value ? 'text-nexus-inverse/60' : 'text-nexus-muted/60'}`}>
                          {r.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 提交按钮 */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleSwitchToPhase1}
                  className="cursor-target flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-nexus-muted bg-nexus-surface border border-nexus-border rounded-xl hover:text-nexus-text transition-all"
                >
                  返回上一步
                </button>
                <button
                  onClick={handlePhase2Submit}
                  disabled={phase2Status === 'submitting' || !editablePrompt.trim()}
                  className="cursor-target px-6 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {phase2Status === 'submitting' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} />
                  )}
                  开始生成视频
                </button>
              </div>
            </>
          )}

          {/* 视频生成中 — 长时间等待动画 */}
          {phase2Status === 'processing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-nexus-surface border border-nexus-primary/20 rounded-2xl p-8"
            >
              <div className="text-center space-y-6">
                {/* 中心动画 */}
                <div className="relative w-24 h-24 mx-auto">
                  {/* 外圈旋转 */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-nexus-primary/20"
                    style={{ borderTopColor: 'var(--color-nexus-primary)' }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  />
                  {/* 内圈反向旋转 */}
                  <motion.div
                    className="absolute inset-2 rounded-full border-2 border-nexus-secondary/20"
                    style={{ borderBottomColor: 'var(--color-nexus-secondary)' }}
                    animate={{ rotate: -360 }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                  />
                  {/* 中心图标 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Film size={28} className="text-nexus-primary" />
                    </motion.div>
                  </div>
                  {/* 呼吸光晕 */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ boxShadow: '0 0 30px rgba(62, 237, 231, 0.2)' }}
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  />
                </div>

                <div>
                  <p className="text-base font-bold text-nexus-text">视频正在生成中</p>
                  <p className="text-xs text-nexus-muted mt-2">
                    视频生成通常需要 <span className="text-nexus-primary font-bold">3-10 分钟</span>，请耐心等待
                  </p>
                  <p className="text-[11px] text-nexus-muted/60 mt-1">
                    您可以离开此页面，任务不会中断
                  </p>
                </div>

                {/* 进度条 */}
                <div className="max-w-xs mx-auto">
                  <div className="w-full h-1.5 bg-nexus-bg rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, var(--color-nexus-primary), var(--color-nexus-secondary), var(--color-nexus-primary))',
                        backgroundSize: '200% 100%',
                      }}
                      animate={{
                        width: ['5%', '90%'],
                        backgroundPosition: ['0% 0%', '200% 0%'],
                      }}
                      transition={{
                        width: { duration: 300, ease: 'easeOut' },
                        backgroundPosition: { repeat: Infinity, duration: 2, ease: 'linear' },
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-nexus-muted/50 mt-2">
                    任务 ID: {phase2TaskId.slice(0, 16)}...
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* 视频生成完成 */}
          {phase2Status === 'done' && videoUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="bg-nexus-surface border border-nexus-secondary/30 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-nexus-border">
                  <CheckCircle2 size={14} className="text-nexus-secondary" />
                  <span className="text-xs font-bold text-nexus-text">视频生成完成</span>
                </div>
                <div className="p-5">
                  <video
                    src={videoUrl}
                    controls
                    className="w-full rounded-xl bg-nexus-bg max-h-[500px]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setPhase2Status('idle');
                    setVideoUrl('');
                    scopedStorage.removeItem(STORAGE_KEY_PHASE2);
                  }}
                  className="cursor-target flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-nexus-muted bg-nexus-surface border border-nexus-border rounded-xl hover:text-nexus-text transition-all"
                >
                  <RotateCcw size={14} />
                  重新生成
                </button>
                <a
                  href={videoUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-target flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all"
                >
                  <Download size={16} />
                  下载视频
                </a>
              </div>
            </motion.div>
          )}

          {/* 第二阶段错误 */}
          <AnimatePresence>
            {phase2Error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle size={14} />
                    {phase2Error}
                  </div>
                  <button
                    onClick={() => {
                      setPhase2Status('idle');
                      setPhase2Error('');
                      scopedStorage.removeItem(STORAGE_KEY_PHASE2);
                    }}
                    className="cursor-target flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-nexus-primary bg-nexus-primary/10 border border-nexus-primary/20 rounded-lg hover:bg-nexus-primary/20 transition-all"
                  >
                    <RotateCcw size={12} />
                    重新提交
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
