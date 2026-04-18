import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ImageIcon,
  Video,
  Upload,
  Zap,
  Loader2,
  Download,
  X,
  Eraser,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Type,
  Film,
  Gauge,
  RotateCcw,
} from 'lucide-react';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage, getUserScopedKey } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';

/**
 * 水印/字幕消除工具组件
 * NOTE: 左右双面板布局 — 左侧图片去水印, 右侧视频去字幕
 * 设计决策：
 *  - 图片去水印：只需上传图片，无额外参数
 *  - 视频去字幕：需要视频 + 提示词 + 时长 + 帧率
 *  - 两个任务不能并行（API 只支持一个并发）
 *  - 结果持久化到 localStorage，切换页面再回来仍保留
 *  - 支持拖拽上传
 */

// ==================== 常量 ====================

const CREDIT_IMAGE = 1;
const CREDIT_VIDEO = 1;
const POLL_INTERVAL = 5000;
const LS_KEY_IMAGE_TASK = 'kunlun_wm_image_task';
const LS_KEY_VIDEO_TASK = 'kunlun_wm_video_task';

/** 视频去字幕预设提示词 */
const PROMPT_PRESETS = [
  { label: 'AI 水印通用', value: 'Remove watermarks and remove Sora text and icons, as well as Seedance text and icons' },
  { label: '纯字幕', value: 'Remove all subtitle text at the bottom of the video' },
  { label: '水印+字幕', value: 'Remove all watermarks, logos, subtitles and text overlays from the video' },
  { label: '指定平台', value: 'Remove TikTok watermark and logo from the video' },
];

// ==================== 类型 ====================

interface TaskState {
  taskId: string;
  status: 'uploading' | 'processing' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  resultUrl?: string;
  outputType?: string;
  errorMessage?: string;
  creditCost: number;
}

/**
 * 持久化的任务数据（存入 localStorage）
 * NOTE: 同时支持进行中的任务和已完成的结果，
 * 确保用户离开页面再回来时不丢失正在处理的任务
 */
interface PersistedTask {
  taskId: string;
  status: TaskState['status'];
  resultUrl?: string;
  outputType?: string;
  type: 'image' | 'video';
  timestamp: number;
}

// ==================== 工具函数 ====================

/** 从 localStorage 恢复任务（包括进行中和已完成的） */
function loadPersistedTask(key: string): TaskState | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(key));
    if (!raw) return null;
    const data: PersistedTask = JSON.parse(raw);
    return {
      taskId: data.taskId,
      status: data.status,
      resultUrl: data.resultUrl,
      outputType: data.outputType,
      creditCost: 0,
    };
  } catch {
    return null;
  }
}

/** 将任务状态持久化到 localStorage（包括进行中状态） */
function savePersistedTask(key: string, task: TaskState, type: 'image' | 'video'): void {
  if (!task.taskId) return;
  const data: PersistedTask = {
    taskId: task.taskId,
    status: task.status,
    resultUrl: task.resultUrl,
    outputType: task.outputType || '',
    type,
    timestamp: Date.now(),
  };
  localStorage.setItem(getUserScopedKey(key), JSON.stringify(data));
}

// ==================== 主组件 ====================

export default function WatermarkRemovalTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  // ========== 图片去水印状态 ==========
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageTask, setImageTask] = useState<TaskState | null>(() => loadPersistedTask(LS_KEY_IMAGE_TASK));
  const [imageLoading, setImageLoading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);

  // ========== 视频去字幕状态 ==========
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [videoPrompt, setVideoPrompt] = useState(PROMPT_PRESETS[0].value);
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoFps, setVideoFps] = useState<16 | 24>(16);
  const [videoTask, setVideoTask] = useState<TaskState | null>(() => loadPersistedTask(LS_KEY_VIDEO_TASK));
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);

  const [error, setError] = useState('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imagePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // NOTE: 防止 setInterval 异步竞态导致 completed 分支重入（重复扣费）
  const completedRef = useRef<{ image: boolean; video: boolean }>({ image: false, video: false });

  // NOTE: API 只支持一个并发，任一面板处理中时另一面板禁止提交
  const isAnyTaskRunning = imageLoading || videoLoading;

  // ========== 轮询清理 ==========
  useEffect(() => {
    return () => {
      if (imagePollRef.current) clearInterval(imagePollRef.current);
      if (videoPollRef.current) clearInterval(videoPollRef.current);
    };
  }, []);

  // ========== 轮询任务状态 ==========
  const pollTaskStatus = useCallback((taskId: string, type: 'image' | 'video') => {
    const setTask = type === 'image' ? setImageTask : setVideoTask;
    const setLoading = type === 'image' ? setImageLoading : setVideoLoading;
    const lsKey = type === 'image' ? LS_KEY_IMAGE_TASK : LS_KEY_VIDEO_TASK;
    const timerRef = type === 'image' ? imagePollRef : videoPollRef;

    if (timerRef.current) clearInterval(timerRef.current);
    // NOTE: 重置完成标记，允许新的轮询正常执行
    completedRef.current[type] = false;

    // 标记为加载中
    setLoading(true);

    timerRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/watermark-removal/task/${taskId}`);
        if (!resp.ok) return;
        const data = await resp.json();

        const updatedTask: TaskState = {
          taskId,
          status: data.status,
          resultUrl: data.resultUrl,
          outputType: data.outputType,
          errorMessage: data.errorMessage,
          creditCost: type === 'image' ? CREDIT_IMAGE : CREDIT_VIDEO,
        };

        setTask(updatedTask);
        // 每次轮询都更新 localStorage 中的状态
        savePersistedTask(lsKey, updatedTask, type);

        if (data.status === 'SUCCESS' || data.status === 'FAILED') {
          // GUARD: 防止异步竞态重入，避免 consumeCredits 被调用两次
          if (completedRef.current[type]) return;
          completedRef.current[type] = true;
          if (timerRef.current) clearInterval(timerRef.current);
          setLoading(false);

          // 记录到资产库和历史
          if (data.status === 'SUCCESS' && data.resultUrl) {
            const now = Date.now();
            const dateStr = new Date(now).toLocaleDateString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
            }).replace(/\//g, '-');

            addAssetRecordWithSize({
              id: `asset-wm-${now}`,
              name: `${type === 'image' ? 'watermark_removed' : 'subtitle_removed'}_${taskId.slice(0, 8)}.${data.outputType || (type === 'image' ? 'png' : 'mp4')}`,
              source: type === 'image' ? '数字工厂-图片去水印' : '数字工厂-视频去字幕',
              type: type,
              downloadUrl: data.resultUrl,
              size: '-',
              date: dateStr,
              toolId: 'watermark-removal',
            });

            addHistoryRecord({
              id: `history-wm-${now}`,
              toolName: type === 'image' ? '图片去水印' : '视频去字幕',
              action: type === 'image' ? '图片去水印处理完成' : '视频去字幕处理完成',
              status: 'success',
              time: new Date(now).toISOString(),
              duration: '-',
              output: data.resultUrl,
            });

            // NOTE: 成功后扣除积分 — 使用顶部常量，与 checkCredits 保持一致
            await consumeCredits(
              type === 'image' ? CREDIT_IMAGE : CREDIT_VIDEO,
              type === 'image' ? '图片去水印' : '视频去字幕'
            );
          }

          // 失败时清除 localStorage 中的任务
          if (data.status === 'FAILED') {
            scopedStorage.removeItem(lsKey);
          }
        }
      } catch {
        /* ignore polling errors */
      }
    }, POLL_INTERVAL);
  }, []);

  /**
   * 组件挂载时：恢复进行中的任务并自动继续轮询
   * NOTE: 这是解决「离开页面再回来任务丢失」的核心逻辑
   */
  useEffect(() => {
    const savedImageTask = loadPersistedTask(LS_KEY_IMAGE_TASK);
    if (savedImageTask && savedImageTask.taskId && savedImageTask.status !== 'SUCCESS' && savedImageTask.status !== 'FAILED') {
      setImageTask(savedImageTask);
      pollTaskStatus(savedImageTask.taskId, 'image');
    }

    const savedVideoTask = loadPersistedTask(LS_KEY_VIDEO_TASK);
    if (savedVideoTask && savedVideoTask.taskId && savedVideoTask.status !== 'SUCCESS' && savedVideoTask.status !== 'FAILED') {
      setVideoTask(savedVideoTask);
      pollTaskStatus(savedVideoTask.taskId, 'video');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== 通用文件处理 ==========
  const processImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageFile(file);
    setImageTask(null);
    setError('');
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const processVideoFile = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) return;
    setVideoFile(file);
    setVideoTask(null);
    setError('');

    const videoEl = document.createElement('video');
    videoEl.src = URL.createObjectURL(file);
    videoEl.addEventListener('loadedmetadata', () => {
      const dur = Math.ceil(videoEl.duration);
      if (dur > 0 && dur <= 60) setVideoDuration(dur);
    });
    videoEl.addEventListener('loadeddata', () => { videoEl.currentTime = 1; });
    videoEl.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoEl, 0, 0);
      setVideoPreview(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(videoEl.src);
    });
  }, []);

  // ========== 文件选择 ==========
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processImageFile(selected);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processVideoFile(selected);
  };

  // ========== 拖拽上传 ==========
  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setImageDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) processImageFile(file);
  }, [processImageFile]);

  const handleVideoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setVideoDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) processVideoFile(file);
  }, [processVideoFile]);

  const preventDragDefault = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  // ========== 提交图片去水印 ==========
  const handleImageSubmit = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_IMAGE, '图片去水印')) return;
    if (!imageFile) { setError('请先上传图片'); return; }
    if (isAnyTaskRunning) { setError('请等待当前任务完成'); return; }
    setImageLoading(true);
    setError('');
    setImageTask({ taskId: '', status: 'uploading', creditCost: CREDIT_IMAGE });

    try {
      const formData = new FormData();
      formData.append('file', imageFile);

      const resp = await fetch('/api/watermark-removal/image/submit', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || '图片提交失败');
      }
      const data = await resp.json();
      const submittedTask: TaskState = { taskId: data.taskId, status: 'processing', creditCost: data.creditCost };
      setImageTask(submittedTask);
      // 立即持久化 taskId，确保离开页面不丢失
      savePersistedTask(LS_KEY_IMAGE_TASK, submittedTask, 'image');
      pollTaskStatus(data.taskId, 'image');
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片去水印请求失败');
      setImageLoading(false);
      setImageTask(null);
    }
  };

  // ========== 提交视频去字幕 ==========
  const handleVideoSubmit = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_VIDEO, '视频去字幕')) return;
    if (!videoFile) { setError('请先上传视频'); return; }
    if (isAnyTaskRunning) { setError('请等待当前任务完成'); return; }
    setVideoLoading(true);
    setError('');
    setVideoTask({ taskId: '', status: 'uploading', creditCost: CREDIT_VIDEO });

    try {
      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('prompt', videoPrompt);
      formData.append('duration', String(videoDuration));
      formData.append('fps', String(videoFps));

      const resp = await fetch('/api/watermark-removal/video/submit', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || '视频提交失败');
      }
      const data = await resp.json();
      const submittedTask: TaskState = { taskId: data.taskId, status: 'processing', creditCost: data.creditCost };
      setVideoTask(submittedTask);
      // 立即持久化 taskId，确保离开页面不丢失
      savePersistedTask(LS_KEY_VIDEO_TASK, submittedTask, 'video');
      pollTaskStatus(data.taskId, 'video');
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频去字幕请求失败');
      setVideoLoading(false);
      setVideoTask(null);
    }
  };

  // ========== 重新去水印/字幕 → 清除结果回到上传文件页面 ==========
  const handleImageReset = () => {
    setImageTask(null);
    scopedStorage.removeItem(LS_KEY_IMAGE_TASK);
  };

  const handleVideoReset = () => {
    setVideoTask(null);
    scopedStorage.removeItem(LS_KEY_VIDEO_TASK);
  };

  // ========== 判断是否有已完成的结果 ==========
  const imageCompleted = imageTask?.status === 'SUCCESS';
  const videoCompleted = videoTask?.status === 'SUCCESS';

  return (
    <div className="flex gap-5 h-[calc(100vh-200px)] min-h-[500px]">

      {/* ===================== 左侧：图片去水印 ===================== */}
      <div className="flex-1 flex flex-col bg-nexus-surface/20 border border-nexus-border rounded-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-nexus-border/50 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nexus-primary/20 to-nexus-secondary/10 border border-nexus-primary/20 flex items-center justify-center">
            <ImageIcon size={16} className="text-nexus-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-nexus-text">图片去水印</h3>
            <p className="text-[10px] text-nexus-muted">上传图片 → AI 自动识别并消除水印</p>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-amber-400/80">
            <Zap size={10} />
            <span>{CREDIT_IMAGE} 算力/张</span>
          </div>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          <div className="p-5 flex flex-col gap-4">
            {/* 上传区域 — 没有文件且没有已完成的结果 */}
            {!imageFile && !imageCompleted && (
              <label
                htmlFor="image-upload-input"
                className={`cursor-target min-h-[280px] flex flex-col items-center justify-center bg-nexus-bg/30 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                  imageDragOver
                    ? 'border-nexus-primary/60 bg-nexus-primary/[0.05]'
                    : 'border-nexus-border/40 hover:border-nexus-primary/40 hover:bg-nexus-primary/[0.02]'
                }`}
                onDragOver={(e) => { preventDragDefault(e); setImageDragOver(true); }}
                onDragLeave={() => setImageDragOver(false)}
                onDrop={handleImageDrop}
              >
                <input
                  id="image-upload-input"
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="absolute w-0 h-0 opacity-0 overflow-hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-nexus-surface/50 border border-nexus-border/40 flex items-center justify-center mb-3">
                  <Upload size={22} className="text-nexus-muted/50" />
                </div>
                <p className="text-xs text-nexus-muted">
                  点击或拖拽上传 <span className="text-nexus-primary font-medium">图片</span> 文件
                </p>
                <p className="text-[10px] text-nexus-muted/40 mt-1">支持 JPG、PNG、WebP 格式</p>
              </label>
            )}

            {/* 已上传文件 — 预览 + 操作按钮 */}
            {imageFile && !imageCompleted && (
              <>
                <div className="relative rounded-xl overflow-hidden border border-nexus-border/30 bg-nexus-bg/30">
                  {imagePreview && (
                    <img src={imagePreview} alt="预览" className="w-full max-h-[260px] object-contain" />
                  )}
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(''); setImageTask(null); }}
                    className="cursor-target absolute top-2 right-2 w-7 h-7 rounded-lg bg-nexus-bg/80 border border-nexus-border/50 flex items-center justify-center text-nexus-muted hover:text-red-400 hover:border-red-400/30 transition-all"
                  >
                    <X size={12} />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-nexus-bg/80 border border-nexus-border/30 rounded-md text-[9px] text-nexus-muted font-mono truncate max-w-[200px]">
                    {imageFile.name}
                  </div>
                </div>

                {/* 提交按钮 — 底部固定高度 */}
                <button
                  onClick={handleImageSubmit}
                  disabled={imageLoading || isAnyTaskRunning}
                  className="cursor-target w-full h-12 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-bg font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  {imageLoading ? <Loader2 size={16} className="animate-spin" /> : <Eraser size={16} />}
                  {imageLoading ? '处理中...' : '开始去水印'}
                </button>
              </>
            )}

            {/* 处理中的进度状态 */}
            {imageTask && !imageCompleted && imageTask.status !== 'FAILED' && imageLoading && (
              <TaskProgressBar type="image" task={imageTask} />
            )}

            {/* 处理完成：结果展示 */}
            {imageCompleted && imageTask.resultUrl && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400">处理完成</span>
                  <span className="text-[9px] text-nexus-muted/50 font-mono ml-auto">
                    {imageTask.taskId.slice(0, 12)}...
                  </span>
                </div>
                <img
                  src={imageTask.resultUrl}
                  alt="去水印结果"
                  className="w-full rounded-xl border border-nexus-border/20"
                />
                <div className="flex gap-3">
                  <a
                    href={imageTask.resultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="cursor-target flex-1 h-12 flex items-center justify-center gap-2 bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary text-xs font-bold rounded-xl hover:bg-nexus-primary/20 transition-all"
                  >
                    <Download size={14} />
                    下载结果
                  </a>
                  <button
                    onClick={handleImageReset}
                    className="cursor-target flex-1 h-12 flex items-center justify-center gap-2 bg-nexus-surface/30 border border-nexus-border/40 text-nexus-muted text-xs font-bold rounded-xl hover:border-nexus-primary/30 hover:text-nexus-text transition-all"
                  >
                    <RotateCcw size={14} />
                    重新去水印
                  </button>
                </div>
              </div>
            )}

            {/* 失败状态 */}
            {imageTask?.status === 'FAILED' && (
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs font-bold text-red-400">处理失败</span>
                </div>
                {imageTask.errorMessage && (
                  <p className="text-[10px] text-red-400/70">{imageTask.errorMessage}</p>
                )}
                <button
                  onClick={() => setImageTask(null)}
                  className="cursor-target text-[10px] text-nexus-muted hover:text-nexus-text underline"
                >
                  重试
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================== 右侧：视频去字幕 ===================== */}
      <div className="flex-1 flex flex-col bg-nexus-surface/20 border border-nexus-border rounded-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-nexus-border/50 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#A78BFA]/20 to-[#7C3AED]/10 border border-[#A78BFA]/20 flex items-center justify-center">
            <Video size={16} className="text-[#A78BFA]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-nexus-text">视频去字幕</h3>
            <p className="text-[10px] text-nexus-muted">上传视频 → 设置参数 → AI 消除字幕/水印</p>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-amber-400/80">
            <Zap size={10} />
            <span>{CREDIT_VIDEO} 算力/段</span>
          </div>
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
          <div className="p-5 flex flex-col gap-4">
            {/* 上传区域 — 没有文件且没有已完成的结果 */}
            {!videoFile && !videoCompleted && (
              <label
                htmlFor="video-upload-input"
                className={`cursor-target min-h-[280px] flex flex-col items-center justify-center bg-nexus-bg/30 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                  videoDragOver
                    ? 'border-[#A78BFA]/60 bg-[#A78BFA]/[0.05]'
                    : 'border-nexus-border/40 hover:border-[#A78BFA]/40 hover:bg-[#A78BFA]/[0.02]'
                }`}
                onDragOver={(e) => { preventDragDefault(e); setVideoDragOver(true); }}
                onDragLeave={() => setVideoDragOver(false)}
                onDrop={handleVideoDrop}
              >
                <input
                  id="video-upload-input"
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleVideoSelect}
                  className="absolute w-0 h-0 opacity-0 overflow-hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-nexus-surface/50 border border-nexus-border/40 flex items-center justify-center mb-3">
                  <Upload size={22} className="text-nexus-muted/50" />
                </div>
                <p className="text-xs text-nexus-muted">
                  点击或拖拽上传 <span className="text-[#A78BFA] font-medium">视频</span> 文件
                </p>
                <p className="text-[10px] text-nexus-muted/40 mt-1">支持 MP4、MOV、AVI 格式</p>
              </label>
            )}

            {/* 已上传文件 — 预览 + 参数 + 按钮 */}
            {videoFile && !videoCompleted && (
              <>
                {/* 视频第一帧预览 */}
                <div className="relative rounded-xl overflow-hidden border border-nexus-border/30 bg-nexus-bg/30">
                  {videoPreview && (
                    <img src={videoPreview} alt="视频预览" className="w-full max-h-[140px] object-contain" />
                  )}
                  <button
                    onClick={() => { setVideoFile(null); setVideoPreview(''); setVideoTask(null); }}
                    className="cursor-target absolute top-2 right-2 w-7 h-7 rounded-lg bg-nexus-bg/80 border border-nexus-border/50 flex items-center justify-center text-nexus-muted hover:text-red-400 hover:border-red-400/30 transition-all"
                  >
                    <X size={12} />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-nexus-bg/80 border border-nexus-border/30 rounded-md text-[9px] text-nexus-muted font-mono truncate max-w-[200px]">
                    {videoFile.name}
                  </div>
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#A78BFA]/20 border border-[#A78BFA]/30 rounded-md text-[9px] text-[#A78BFA] font-bold">
                    VIDEO
                  </div>
                </div>

                {/* 参数设置 */}
                <div className="space-y-3">
                  {/* 提示词 */}
                  <div>
                    <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                      <Type size={10} />提示词
                    </label>
                    <textarea
                      value={videoPrompt}
                      onChange={e => setVideoPrompt(e.target.value)}
                      rows={2}
                      className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-lg px-3 py-2 text-xs text-nexus-text placeholder:text-nexus-muted/30 focus:border-[#A78BFA]/50 focus:outline-none resize-none transition-colors"
                      placeholder="描述要移除的内容..."
                    />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {PROMPT_PRESETS.map(preset => (
                        <button
                          key={preset.label}
                          onClick={() => setVideoPrompt(preset.value)}
                          className={`cursor-target px-2 py-1 rounded-md text-[9px] border transition-all ${
                            videoPrompt === preset.value
                              ? 'border-[#A78BFA]/40 bg-[#A78BFA]/10 text-[#A78BFA]'
                              : 'border-nexus-border/30 bg-nexus-bg/20 text-nexus-muted/60 hover:border-nexus-border hover:text-nexus-muted'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 时长 + 帧率 */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                        <Film size={10} />时长（秒）
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={videoDuration}
                        onChange={e => setVideoDuration(Math.max(1, Math.min(60, Number(e.target.value))))}
                        className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-lg px-3 py-2 text-xs text-nexus-text focus:border-[#A78BFA]/50 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                        <Gauge size={10} />帧率 (FPS)
                      </label>
                      <div className="flex gap-1.5">
                        {([16, 24] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => setVideoFps(f)}
                            className={`cursor-target flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                              videoFps === f
                                ? 'border-[#A78BFA]/40 bg-[#A78BFA]/10 text-[#A78BFA]'
                                : 'border-nexus-border/30 bg-nexus-bg/30 text-nexus-muted hover:border-nexus-border'
                            }`}
                          >
                            {f} fps
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 提交按钮 */}
                <button
                  onClick={handleVideoSubmit}
                  disabled={videoLoading || isAnyTaskRunning}
                  className="cursor-target w-full h-12 bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] text-white font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  {videoLoading ? <Loader2 size={16} className="animate-spin" /> : <Eraser size={16} />}
                  {videoLoading ? '处理中...' : '开始去字幕'}
                </button>
              </>
            )}

            {/* 处理中的进度状态 */}
            {videoTask && !videoCompleted && videoTask.status !== 'FAILED' && videoLoading && (
              <TaskProgressBar type="video" task={videoTask} />
            )}

            {/* 处理完成：结果展示 */}
            {videoCompleted && videoTask.resultUrl && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400">处理完成</span>
                  <span className="text-[9px] text-nexus-muted/50 font-mono ml-auto">
                    {videoTask.taskId.slice(0, 12)}...
                  </span>
                </div>
                <video
                  src={videoTask.resultUrl}
                  controls
                  className="w-full rounded-xl border border-nexus-border/20"
                  style={{ maxHeight: 240 }}
                />
                <div className="flex gap-3">
                  <a
                    href={videoTask.resultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="cursor-target flex-1 h-12 flex items-center justify-center gap-2 bg-[#A78BFA]/10 border border-[#A78BFA]/30 text-[#A78BFA] text-xs font-bold rounded-xl hover:bg-[#A78BFA]/20 transition-all"
                  >
                    <Download size={14} />
                    下载结果
                  </a>
                  <button
                    onClick={handleVideoReset}
                    className="cursor-target flex-1 h-12 flex items-center justify-center gap-2 bg-nexus-surface/30 border border-nexus-border/40 text-nexus-muted text-xs font-bold rounded-xl hover:border-[#A78BFA]/30 hover:text-nexus-text transition-all"
                  >
                    <RotateCcw size={14} />
                    重新去字幕
                  </button>
                </div>
              </div>
            )}

            {/* 失败状态 */}
            {videoTask?.status === 'FAILED' && (
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs font-bold text-red-400">处理失败</span>
                </div>
                {videoTask.errorMessage && (
                  <p className="text-[10px] text-red-400/70">{videoTask.errorMessage}</p>
                )}
                <button
                  onClick={() => setVideoTask(null)}
                  className="cursor-target text-[10px] text-nexus-muted hover:text-nexus-text underline"
                >
                  重试
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================== 全局错误提示 ===================== */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-500/10 border border-red-500/30 backdrop-blur-md rounded-xl px-5 py-3 text-xs text-red-400 flex items-center gap-3 shadow-2xl"
          >
            <AlertTriangle size={14} />
            <span>{error}</span>
            <button onClick={() => setError('')} className="cursor-target text-red-400/50 hover:text-red-400 ml-2">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ==================== 进度条子组件 ====================

interface TaskProgressBarProps {
  type: 'image' | 'video';
  task: TaskState;
}

/**
 * 任务进度条 — 显示上传中 / 排队中 / 处理中状态
 */
function TaskProgressBar({ type, task }: TaskProgressBarProps) {
  const statusLabels: Record<string, string> = {
    uploading: '正在上传文件...',
    processing: '任务已提交，等待处理...',
    QUEUED: '排队中...',
    RUNNING: 'AI 正在处理...',
  };

  const color = type === 'image' ? 'bg-nexus-primary/60' : 'bg-[#A78BFA]/60';
  const spinColor = type === 'image' ? 'text-nexus-primary' : 'text-[#A78BFA]';

  return (
    <div className="p-4 rounded-xl bg-nexus-bg/30 border border-nexus-border/30 space-y-3">
      <div className="flex items-center gap-2.5">
        <Loader2 size={14} className={`animate-spin ${spinColor}`} />
        <span className="text-xs font-bold text-nexus-text">
          {statusLabels[task.status] || task.status}
        </span>
        {task.taskId && (
          <span className="text-[9px] text-nexus-muted/50 font-mono ml-auto">
            {task.taskId.slice(0, 12)}...
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-nexus-bg/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${color}`}
            animate={{ width: ['5%', '60%', '30%', '80%'] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <Clock size={10} className="text-nexus-muted/40" />
      </div>
    </div>
  );
}
