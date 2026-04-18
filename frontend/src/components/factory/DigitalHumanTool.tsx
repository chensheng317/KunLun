import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Loader2,
  Upload,
  X,
  Video,
  Music,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Clock,
  Trash2,
  Image as ImageIcon,
  Mic,
  Sparkles,
  ArrowRight,
  Play,
  Calendar,
} from 'lucide-react';
import { addAssetRecordWithSize, addHistoryRecord } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';
import { scopedStorage } from '../../utils/factory-records';
import { CREDIT_DIGITAL_HUMAN } from './factory-credits';

/**
 * 数字人快速模式工具组件
 * NOTE: 接入即梦数字人快速模式 API
 * 流程: 上传图片 + 音频 → 主体识别 → 视频生成
 *
 * 即梦 API 能力: 单张图片 + 音频 → 音频驱动的数字人视频
 * 人物的情绪、动态与音频强关联（音频即文案载体）
 */

/** 任务状态 */
interface TaskStatus {
  taskId: string;
  type: 'detect' | 'generate';
  status: string;
  statusText: string;
  result?: {
    hasSubject?: boolean;
    description?: string;
    videoUrl?: string;
    remoteVideoUrl?: string;
  };
  error?: {
    error?: string;
    code?: number;
    message: string;
    retryable: boolean;
    requestId?: string;
    debugInfo?: string;
  };
}

/** 历史记录项 */
interface HistoryItem {
  taskId: string;
  videoUrl: string;
  imageUrl: string;
  createdAt: number;
}

/** 错误详情（结构化错误，用于智能提示） */
interface ApiError {
  error: string;
  message: string;
  retryable: boolean;
  code?: number;
  requestId?: string;
  debugInfo?: string;
}

/**
 * 持久化的活跃任务状态
 * NOTE: 用于在离开页面后恢复正在进行中的任务轮询
 */
interface PersistedTask {
  taskId: string;
  type: 'detect' | 'generate';
  imageId: string;
  audioId: string;
  imagePreview: string;
  audioName: string;
  startedAt: number;
}

// localStorage 持久化 key
const LS_KEY_ACTIVE_TASK = 'kunlun_dh_active_task';

export default function DigitalHumanTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  // NOTE: 积分从中心化配置导入，见文件顶部 import
  // ── 文件上传状态 ──
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageId, setImageId] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioName, setAudioName] = useState('');
  const [audioId, setAudioId] = useState('');
  const [uploading, setUploading] = useState(false);

  // ── 主体识别状态 ──
  const [detecting, setDetecting] = useState(false);
  const [_detectTaskId, setDetectTaskId] = useState('');
  const [detectResult, setDetectResult] = useState<TaskStatus['result'] | null>(null);
  const [detectPassed, setDetectPassed] = useState(false);

  // ── 视频生成状态 ──
  const [generating, setGenerating] = useState(false);
  const [_generateTaskId, setGenerateTaskId] = useState('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('');
  const [generateStatus, setGenerateStatus] = useState('');

  // ── 通用状态 ──
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // NOTE: 防止 setInterval 异步竞态导致 completed 分支重入（重复扣费）
  const completedRef = useRef(false);

  // NOTE: 标记初始化是否完成，避免恢复任务时与初始状态竞争
  const initializedRef = useRef(false);

  /** 加载生成历史 */
  const loadHistory = useCallback(async () => {
    try {
      const resp = await fetch('/api/digital-human/history');
      if (resp.ok) {
        const data = await resp.json();
        setHistory(data.history || []);
      }
    } catch { /* 静默 */ }
  }, []);

  /** 清理轮询定时器和超时保护 */
  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /** 持久化当前活跃任务到 localStorage */
  const persistActiveTask = useCallback((task: PersistedTask | null) => {
    try {
      if (task) {
        scopedStorage.setItem(LS_KEY_ACTIVE_TASK, JSON.stringify(task));
      } else {
        scopedStorage.removeItem(LS_KEY_ACTIVE_TASK);
      }
    } catch { /* 静默 */ }
  }, []);

  /** 解析 API 错误响应 */
  const parseApiError = async (resp: Response): Promise<ApiError> => {
    try {
      const data = await resp.json();
      if (data.detail && typeof data.detail === 'object') {
        return data.detail as ApiError;
      }
      return {
        error: 'UNKNOWN',
        message: data.detail || data.message || `请求失败 (${resp.status})`,
        retryable: false,
      };
    } catch {
      return {
        error: 'PARSE_ERROR',
        message: `请求失败 (HTTP ${resp.status})`,
        retryable: true,
      };
    }
  };

  // ──────────────────────────────────────
  // 图片上传
  // ──────────────────────────────────────
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 客户端校验文件大小
    if (file.size > 5 * 1024 * 1024) {
      setApiError({
        error: 'IMAGE_TOO_LARGE',
        message: `图片文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，请压缩至 5MB 以下`,
        retryable: false,
      });
      return;
    }

    setImageFile(file);
    setApiError(null);
    setDetectResult(null);
    setDetectPassed(false);
    setGeneratedVideoUrl('');

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  // ──────────────────────────────────────
  // 音频上传
  // ──────────────────────────────────────
  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioName(file.name);
    setApiError(null);
    setGeneratedVideoUrl('');
  }, []);

  // ──────────────────────────────────────
  // 上传文件到后端
  // ──────────────────────────────────────
  const uploadFiles = async (): Promise<{ imgId: string; audId: string }> => {
    const formData = new FormData();
    if (imageFile) formData.append('image', imageFile);
    if (audioFile) formData.append('audio', audioFile);

    const resp = await fetch('/api/digital-human/upload', {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) {
      const err = await parseApiError(resp);
      throw err;
    }
    const data = await resp.json();
    return { imgId: data.imageId || '', audId: data.audioId || '' };
  };

  // ──────────────────────────────────────
  // 轮询任务状态
  // NOTE: 支持从 localStorage 恢复后继续轮询
  // ──────────────────────────────────────
  const pollTask = useCallback((taskId: string, type: 'detect' | 'generate') => {
    clearPolling();
    // NOTE: 重置完成标记，允许新的轮询正常执行
    completedRef.current = false;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/digital-human/task/${taskId}`);
        if (!resp.ok) return;
        const data: TaskStatus = await resp.json();

        if (type === 'detect') {
          if (data.status === 'completed') {
            // GUARD: 防止异步竞态重入（两次 fetch 同时返回 completed）
            if (completedRef.current) return;
            completedRef.current = true;
            clearPolling();
            setDetecting(false);
            setDetectResult(data.result || null);
            setDetectPassed(data.result?.hasSubject === true);
            // NOTE: 主体识别完成后清除活跃任务，等待用户点击生成
            persistActiveTask(null);
            if (!data.result?.hasSubject) {
              setApiError({
                error: 'NO_SUBJECT',
                message: data.result?.description || '图片中未检测到人物主体，请更换图片',
                retryable: false,
              });
            }
          } else if (data.status === 'failed') {
            clearPolling();
            setDetecting(false);
            persistActiveTask(null);
            setApiError({
              error: data.error?.error || 'DETECT_FAILED',
              message: data.error?.message || data.statusText || '主体识别失败',
              retryable: data.error?.retryable ?? true,
              code: data.error?.code,
              requestId: data.error?.requestId,
            });
          } else {
            setGenerateStatus(data.statusText);
          }
        } else {
          setGenerateStatus(data.statusText);
          if (data.status === 'completed') {
            // GUARD: 防止异步竞态重入，避免 consumeCredits 被调用两次
            if (completedRef.current) return;
            completedRef.current = true;
            clearPolling();
            setGenerating(false);
            setGeneratedVideoUrl(data.result?.videoUrl || '');
            setGenerateStatus('视频生成完成');
            // NOTE: 任务完成，清除活跃任务持久化，同时清除可能残留的错误
            persistActiveTask(null);
            setApiError(null);
            loadHistory();

            // NOTE: 同步写入资产库和历史记录
            const now = Date.now();
            const dateStr = new Date(now).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });
            addAssetRecordWithSize({
              id: `dh-${taskId}`,
              name: `数字人视频_${taskId.slice(0, 8)}.mp4`,
              source: '数字工厂-数字人',
              type: 'video',
              size: '-',
              date: dateStr,
              downloadUrl: data.result?.videoUrl || '',
              toolId: 'digital-human',
            });
            addHistoryRecord({
              id: `history-dh-${taskId}`,
              toolName: '数字人',
              action: '生成数字人视频',
              status: 'success',
              time: new Date(now).toISOString(),
              duration: '-',
              output: `已生成数字人视频，已保存至资产库。`,
            });

            // NOTE: 数字人视频生成成功后扣除积分
            await consumeCredits(CREDIT_DIGITAL_HUMAN, '数字人');
          } else if (data.status === 'failed') {
            clearPolling();
            setGenerating(false);
            persistActiveTask(null);
            setApiError({
              error: data.error?.error || 'GENERATE_FAILED',
              message: data.error?.message || data.statusText || '视频生成失败',
              retryable: data.error?.retryable ?? true,
              code: data.error?.code,
              requestId: data.error?.requestId,
            });
          }
        }
      } catch { /* 继续轮询 */ }
    }, 3000);

    // 10分钟超时保护
    timeoutRef.current = setTimeout(() => {
      // NOTE: 只有在任务仍在进行中时才触发超时错误
      // 避免任务已完成但超时仍触发导致误报错
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        if (type === 'detect') setDetecting(false);
        else setGenerating(false);
        persistActiveTask(null);
        setApiError({
          error: 'TIMEOUT',
          message: '任务超时（10分钟），请稍后通过历史记录查看结果',
          retryable: true,
        });
      }
    }, 600000);
  }, [clearPolling, persistActiveTask, loadHistory]);

  /**
   * 初始化：加载历史记录 + 恢复活跃任务
   * NOTE: 组件挂载时检查 localStorage 中是否有正在进行的任务
   * 如果有，则恢复状态并继续轮询
   */
  useEffect(() => {
    loadHistory();

    try {
      const saved = scopedStorage.getItem(LS_KEY_ACTIVE_TASK);
      if (saved) {
        const task: PersistedTask = JSON.parse(saved);
        // 恢复基本状态
        setImageId(task.imageId);
        setAudioId(task.audioId);
        setImagePreview(task.imagePreview);
        setAudioName(task.audioName);

        if (task.type === 'detect') {
          setDetecting(true);
          setGenerateStatus('恢复中...');
          pollTask(task.taskId, 'detect');
        } else if (task.type === 'generate') {
          setDetectPassed(true);
          setGenerating(true);
          setGenerateStatus('恢复中...');
          pollTask(task.taskId, 'generate');
        }
      }
    } catch { /* 静默 */ }

    initializedRef.current = true;

    return () => {
      clearPolling();
    };
  }, [loadHistory, clearPolling, pollTask]);

  // ──────────────────────────────────────
  // 执行完整流程: 上传 → 主体识别 → 视频生成
  // ──────────────────────────────────────
  const handleStartGeneration = async () => {
    if (!imageFile || !audioFile) {
      setApiError({
        error: 'MISSING_FILES',
        message: '请同时上传人物图片和驱动音频',
        retryable: false,
      });
      return;
    }

    setApiError(null);
    setUploading(true);
    setDetecting(false);
    setDetectResult(null);
    setDetectPassed(false);
    setGenerating(false);
    setGeneratedVideoUrl('');
    setGenerateStatus('');

    try {
      // 步骤1: 上传文件
      const { imgId, audId } = await uploadFiles();
      setImageId(imgId);
      setAudioId(audId);
      setUploading(false);

      // 步骤2: 主体识别
      setDetecting(true);
      const detectFormData = new FormData();
      detectFormData.append('imageId', imgId);

      const detectResp = await fetch('/api/digital-human/detect', {
        method: 'POST',
        body: detectFormData,
      });
      if (!detectResp.ok) {
        const err = await parseApiError(detectResp);
        setDetecting(false);
        setApiError(err);
        return;
      }
      const detectData = await detectResp.json();
      setDetectTaskId(detectData.taskId);

      // NOTE: 持久化当前任务，离开页面后可恢复
      persistActiveTask({
        taskId: detectData.taskId,
        type: 'detect',
        imageId: imgId,
        audioId: audId,
        imagePreview,
        audioName,
        startedAt: Date.now(),
      });

      // 开始轮询主体识别结果
      pollTask(detectData.taskId, 'detect');
    } catch (err) {
      setUploading(false);
      setDetecting(false);
      if (err && typeof err === 'object' && 'message' in err) {
        setApiError(err as ApiError);
      } else {
        setApiError({
          error: 'UNKNOWN',
          message: err instanceof Error ? err.message : '操作失败',
          retryable: true,
        });
      }
    }
  };

  /** 主体识别通过后，开始视频生成 */
  const handleGenerateVideo = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_DIGITAL_HUMAN, '数字人')) return;
    if (!imageId || !audioId) {
      setApiError({
        error: 'MISSING_IDS',
        message: '文件未上传，请重新上传图片和音频',
        retryable: false,
      });
      return;
    }

    setApiError(null);
    setGenerating(true);
    setGeneratedVideoUrl('');
    setGenerateStatus('提交中...');

    try {
      const formData = new FormData();
      formData.append('imageId', imageId);
      formData.append('audioId', audioId);

      const resp = await fetch('/api/digital-human/generate', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const err = await parseApiError(resp);
        setGenerating(false);
        setApiError(err);
        return;
      }
      const data = await resp.json();
      setGenerateTaskId(data.taskId);
      setGenerateStatus('已提交，等待处理...');

      // NOTE: 持久化视频生成任务
      persistActiveTask({
        taskId: data.taskId,
        type: 'generate',
        imageId,
        audioId,
        imagePreview,
        audioName,
        startedAt: Date.now(),
      });

      pollTask(data.taskId, 'generate');
    } catch (err) {
      setGenerating(false);
      setApiError({
        error: 'UNKNOWN',
        message: err instanceof Error ? err.message : '视频生成请求失败',
        retryable: true,
      });
    }
  };

  /** 重置所有状态（再次制作） */
  const handleReset = () => {
    clearPolling();
    completedRef.current = false;
    persistActiveTask(null);
    setImageFile(null);
    setImagePreview('');
    setImageId('');
    setAudioFile(null);
    setAudioName('');
    setAudioId('');
    setUploading(false);
    setDetecting(false);
    setDetectResult(null);
    setDetectPassed(false);
    setDetectTaskId('');
    setGenerating(false);
    setGeneratedVideoUrl('');
    setGenerateTaskId('');
    setGenerateStatus('');
    setApiError(null);
  };

  // ──────────────────────────────────────
  // 流程步骤状态
  // ──────────────────────────────────────
  type StepState = 'pending' | 'active' | 'done' | 'error';
  const getStepState = (step: 'upload' | 'detect' | 'generate'): StepState => {
    if (step === 'upload') {
      if (uploading) return 'active';
      if (imageId && audioId) return 'done';
      return 'pending';
    }
    if (step === 'detect') {
      if (detecting) return 'active';
      if (detectPassed) return 'done';
      if (detectResult && !detectResult.hasSubject) return 'error';
      return 'pending';
    }
    if (step === 'generate') {
      if (generating) return 'active';
      if (generatedVideoUrl) return 'done';
      return 'pending';
    }
    return 'pending';
  };

  const stepBorderColor = (state: StepState) => {
    switch (state) {
      case 'active': return 'border-nexus-primary/50';
      case 'done': return 'border-emerald-500/50';
      case 'error': return 'border-red-500/50';
      default: return 'border-nexus-border';
    }
  };

  return (
    <div className="space-y-5">
      {/* ── 标题 ── */}
      <div className="px-1">
        <h2 className="text-sm font-bold text-nexus-text">数字人快速模式</h2>
      </div>

      {/* ── 流程步骤指示器 ── */}
      <div className="flex items-center gap-2 px-1">
        {(['upload', 'detect', 'generate'] as const).map((step, i) => {
          const state = getStepState(step);
          const labels = { upload: '上传素材', detect: '主体识别', generate: '生成视频' };
          const icons = {
            upload: <Upload size={12} />,
            detect: <User size={12} />,
            generate: <Video size={12} />,
          };
          return (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                state === 'active' ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/30' :
                state === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                state === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                'bg-nexus-surface/50 text-nexus-muted border border-nexus-border'
              }`}>
                {state === 'active' ? <Loader2 size={12} className="animate-spin" /> :
                 state === 'done' ? <CheckCircle2 size={12} /> :
                 state === 'error' ? <XCircle size={12} /> :
                 icons[step]}
                {labels[step]}
              </div>
              {i < 2 && <ArrowRight size={12} className="text-nexus-border" />}
            </div>
          );
        })}
      </div>

      {/* ── 上传区域: 图片 + 音频 ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* 图片上传 */}
        <div className={`bg-nexus-surface/50 border ${stepBorderColor(getStepState('upload'))} rounded-2xl p-4 transition-all`}>
          <label className="text-xs text-nexus-muted mb-2.5 flex items-center gap-1.5 font-medium">
            <ImageIcon size={13} className="text-nexus-primary" />
            人物图片 <span className="text-red-400">*</span>
          </label>
          <div
            className="cursor-target border border-dashed border-nexus-border rounded-xl p-4 text-center cursor-pointer hover:border-nexus-primary/40 transition-all min-h-[140px] flex items-center justify-center"
            onClick={() => imageInputRef.current?.click()}
          >
            <input
              ref={imageInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.jfif"
              onChange={handleImageSelect}
              className="hidden"
            />
            {imagePreview ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <img
                  src={imagePreview}
                  alt="人物照片"
                  className="w-24 h-24 object-cover rounded-xl border border-nexus-border"
                />
                <p className="text-[10px] text-nexus-muted truncate max-w-full">{imageFile?.name || '已上传图片'}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFile(null);
                    setImagePreview('');
                    setImageId('');
                    setDetectResult(null);
                    setDetectPassed(false);
                  }}
                  className="cursor-target text-nexus-muted hover:text-red-400 text-xs flex items-center gap-1"
                >
                  <X size={12} /> 移除
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-nexus-muted">
                <Upload size={22} />
                <span className="text-xs">点击上传人物照片</span>
                <span className="text-[10px] opacity-60">JPG / PNG / JFIF · {'<'}5MB</span>
                <span className="text-[10px] opacity-40">单人、正面、人脸占比大效果最佳</span>
              </div>
            )}
          </div>
        </div>

        {/* 音频上传 */}
        <div className={`bg-nexus-surface/50 border ${stepBorderColor(getStepState('upload'))} rounded-2xl p-4 transition-all`}>
          <label className="text-xs text-nexus-muted mb-2.5 flex items-center gap-1.5 font-medium">
            <Mic size={13} className="text-nexus-primary" />
            驱动音频 <span className="text-red-400">*</span>
          </label>
          <div
            className="cursor-target border border-dashed border-nexus-border rounded-xl p-4 text-center cursor-pointer hover:border-nexus-primary/40 transition-all min-h-[140px] flex items-center justify-center"
            onClick={() => audioInputRef.current?.click()}
          >
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.aac,.ogg,.flac"
              onChange={handleAudioSelect}
              className="hidden"
            />
            {audioFile || audioName ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-nexus-primary/20 to-nexus-secondary/20 border border-nexus-primary/30 flex items-center justify-center">
                  <Music size={28} className="text-nexus-primary" />
                </div>
                <p className="text-[10px] text-nexus-muted truncate max-w-full">{audioName || '已上传音频'}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAudioFile(null);
                    setAudioName('');
                    setAudioId('');
                  }}
                  className="cursor-target text-nexus-muted hover:text-red-400 text-xs flex items-center gap-1"
                >
                  <X size={12} /> 移除
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-nexus-muted">
                <Music size={22} />
                <span className="text-xs">点击上传驱动音频</span>
                <span className="text-[10px] opacity-60">MP3 / WAV / M4A · 建议15秒以内</span>
                <span className="text-[10px] opacity-40">音频即文案，数字人将按音频内容说话/唱歌</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 主体识别结果 ── */}
      <AnimatePresence>
        {detectResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-xl px-4 py-3 flex items-center gap-2.5 text-sm ${
              detectResult.hasSubject
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {detectResult.hasSubject ? (
              <CheckCircle2 size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <span className="text-xs">{detectResult.description}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 错误提示 ── */}
      <AnimatePresence>
        {apiError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-red-400 font-medium">{apiError.message}</p>
                {apiError.retryable && (
                  <p className="text-[10px] text-red-400/60 mt-1">此错误可重试，请稍后再试</p>
                )}
                {apiError.requestId && (
                  <p className="text-[10px] text-nexus-muted mt-1 font-mono">
                    RequestID: {apiError.requestId}
                  </p>
                )}
                {apiError.code && (
                  <p className="text-[10px] text-nexus-muted font-mono">
                    ErrorCode: {apiError.code}
                  </p>
                )}
              </div>
              <button
                onClick={() => setApiError(null)}
                className="cursor-target text-red-400/60 hover:text-red-400"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 操作按钮区 ── */}
      <div className="flex items-center gap-3">
        {/* 未通过主体识别时：显示开始检测按钮 */}
        {!detectPassed && !generatedVideoUrl && (
          <button
            onClick={handleStartGeneration}
            disabled={!imageFile || !audioFile || uploading || detecting}
            className="cursor-target flex-1 px-5 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><Loader2 size={16} className="animate-spin" /> 上传中...</>
            ) : detecting ? (
              <><Loader2 size={16} className="animate-spin" /> 主体识别中...</>
            ) : (
              <><Sparkles size={16} /> 上传并检测</>
            )}
          </button>
        )}

        {/* 主体识别通过后：显示生成视频按钮 */}
        {detectPassed && !generatedVideoUrl && (
          <button
            onClick={handleGenerateVideo}
            disabled={generating}
            className="cursor-target flex-1 px-5 py-3 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> {generateStatus || '视频生成中...'}</>
            ) : (
              <><Video size={16} /> 生成数字人视频</>
            )}
          </button>
        )}

        {/* 已有结果：显示再次制作 */}
        {generatedVideoUrl && (
          <button
            onClick={handleReset}
            className="cursor-target px-5 py-3 bg-nexus-surface border border-nexus-border text-nexus-text font-bold text-sm rounded-xl hover:border-nexus-primary/40 transition-all flex items-center gap-2"
          >
            <RefreshCw size={16} /> 再次制作
          </button>
        )}

        {/* 历史记录按钮 */}
        <button
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
          className={`cursor-target px-4 py-3 rounded-xl border text-sm transition-all flex items-center gap-2 ${
            showHistory
              ? 'bg-nexus-primary/10 border-nexus-primary/30 text-nexus-primary'
              : 'bg-nexus-surface border-nexus-border text-nexus-muted hover:border-nexus-primary/30'
          }`}
        >
          <Clock size={14} />
          <span className="text-xs">历史</span>
        </button>
      </div>

      {/* ── 视频生成中状态 ── */}
      <AnimatePresence>
        {generating && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-nexus-surface/50 border border-nexus-primary/20 rounded-2xl p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <Loader2 size={18} className="text-nexus-primary animate-spin" />
              <div>
                <p className="text-sm font-bold text-nexus-text">{generateStatus || '视频生成中...'}</p>
                <p className="text-[10px] text-nexus-muted mt-0.5">
                  处理速度约为音频时长的20倍（如10秒音频约需3-4分钟）
                </p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-nexus-bg rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-nexus-primary to-nexus-secondary rounded-full"
                initial={{ width: '5%' }}
                animate={{ width: '80%' }}
                transition={{ duration: 120, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 生成结果 ── */}
      <AnimatePresence>
        {generatedVideoUrl && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-nexus-surface/50 border border-emerald-500/20 rounded-2xl p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-nexus-text flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              生成完成
            </h3>
            <div className="aspect-video max-w-[400px] mx-auto rounded-xl overflow-hidden border border-nexus-border bg-black">
              <video
                src={generatedVideoUrl}
                controls
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex items-center justify-center gap-3">
              <a
                href={generatedVideoUrl}
                download
                className="cursor-target px-5 py-2.5 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-xs rounded-xl flex items-center gap-2 hover:shadow-[0_0_15px_rgba(62,237,231,0.3)] transition-all"
              >
                <Download size={14} /> 下载视频
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 历史记录（卡片式布局） ── */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-nexus-text flex items-center gap-2">
                  <Clock size={15} className="text-nexus-primary" />
                  生成历史
                </h3>
                {history.length > 0 && (
                  <button
                    onClick={async () => {
                      await fetch('/api/digital-human/history', { method: 'DELETE' });
                      loadHistory();
                    }}
                    className="cursor-target text-[10px] text-nexus-muted hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 size={10} /> 清空
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="text-center py-8">
                  <Video size={32} className="text-nexus-border mx-auto mb-3" />
                  <p className="text-xs text-nexus-muted">暂无生成历史</p>
                  <p className="text-[10px] text-nexus-muted/50 mt-1">生成的数字人视频将在这里展示</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-1">
                  {history.slice().reverse().map((item) => (
                    <motion.div
                      key={item.taskId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group bg-nexus-bg rounded-xl border border-nexus-border overflow-hidden hover:border-nexus-primary/30 transition-all hover:shadow-[0_0_15px_rgba(62,237,231,0.08)]"
                    >
                      {/* 视频预览区 */}
                      <div className="relative aspect-video bg-black">
                        <video
                          src={item.videoUrl}
                          className="w-full h-full object-contain"
                          preload="metadata"
                        />
                        {/* 播放遮罩 */}
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          onClick={() => {
                            // 点击在新窗口打开视频
                            window.open(item.videoUrl, '_blank');
                          }}
                        >
                          <div className="w-10 h-10 rounded-full bg-nexus-primary/90 flex items-center justify-center shadow-lg">
                            <Play size={18} className="text-nexus-inverse ml-0.5" />
                          </div>
                        </div>
                      </div>

                      {/* 信息栏 */}
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] text-nexus-muted">
                            <Calendar size={10} />
                            <span>
                              {new Date(item.createdAt * 1000).toLocaleString('zh-CN', {
                                month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <a
                            href={item.videoUrl}
                            download
                            className="cursor-target flex items-center gap-1 text-[10px] text-nexus-primary hover:text-nexus-secondary px-2 py-1 rounded-lg hover:bg-nexus-primary/10 transition-all"
                          >
                            <Download size={11} />
                            <span>下载</span>
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 使用提示 ── */}
      {!imageFile && !audioFile && !generatedVideoUrl && !detecting && !generating && !imagePreview && (
        <div className="bg-nexus-surface/60 border border-nexus-border/50 rounded-xl px-4 py-3">
          <p className="text-[10px] text-nexus-muted leading-relaxed">
            <strong className="text-nexus-text">使用说明：</strong>
            上传一张包含人物的图片和一段音频，AI 将生成该人物根据音频说话/唱歌的视频。
            人物的口型、情绪和动态将与音频内容强关联。音频驱动模式下，音频本身即为文案载体，无需额外输入文案。
            支持真人照片和动漫/卡通形象。
          </p>
        </div>
      )}
    </div>
  );
}
