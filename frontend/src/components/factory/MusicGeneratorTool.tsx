import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Music,
  Zap,
  Loader2,
  X,
  AlertTriangle,
  Play,
  Pause,
  Download,
  RefreshCw,
  Sparkles,
  FileText,
  Disc3,
  Send,
  Wand2,
  Check,
  RotateCcw,
  ArrowRight,
  Trash2,
  SkipBack,
  SkipForward,
  Repeat,
  Eye,
  Upload,
  Heart,
  Library,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';

/**
 * AI营销音乐工具组件 — 接入 Mureka API
 * NOTE: 参照 Mureka 平台 UI 布局设计，使用 KunLun 品牌配色
 *
 * 核心功能：
 * - 歌词输入 + AI 生成歌词 + 歌词优化
 * - 纯音乐开关
 * - 风格描述 + 推荐标签
 * - 人声性别选择
 * - 歌名输入
 * - 右侧歌曲列表展示
 */

/** Mureka 可用模型 */
const MUREKA_MODELS = [
  { id: 'auto', name: 'Auto' },
  { id: 'mureka-8', name: 'V8' },
  { id: 'mureka-o2', name: 'O2' },
  { id: 'mureka-7.6', name: 'V7.6' },
];

/** 推荐风格标签 — 类似截图中的标签列表 */
const STYLE_TAGS = [
  'Electronic', 'Moody', 'Cello', 'Progressive',
  'Pop', 'R&B', 'Jazz', 'Rock',
  'Hip-hop', 'Classical', 'Ambient', 'Country',
  'Latin', 'Folk', 'Cinematic', 'Lo-fi',
];

/** 生成的歌曲条目 */
interface GeneratedSong {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl: string;
  lyrics: string;
  status: string;
  /** NOTE: 创建时间戳，用于持久化排序 */
  createdAt?: number;
}

/** 参考歌曲信息 */
interface ReferenceFile {
  filename: string;
  originalName: string;
  url: string;
  /** 上传时间戳 */
  uploadedAt?: number;
}

const CREDIT_PER_SONG = 3;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 300000;

// localStorage 持久化 key
const LS_KEY_SONGS = 'kunlun_music_songs';
const LS_KEY_FAVORITES = 'kunlun_music_favorites';
const LS_KEY_REFERENCES = 'kunlun_music_references';
/** 进行中的任务持久化 — 遵循 /async-task-persist-on-navigate 三步闭环 */
const LS_KEY_ACTIVE_TASK = 'kunlun_music_active_task';

/** 持久化任务数据结构 */
interface PersistedTask {
  taskId: string;
  instrumental: boolean;
  status: 'polling';
  submittedAt: number;
}

export default function MusicGeneratorTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  // 生成参数状态
  const [lyrics, setLyrics] = useState('');
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [stylePrompt, setStylePrompt] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [vocal, setVocal] = useState<'female' | 'male'>('female');
  const [songTitle, setSongTitle] = useState('');
  const [model, setModel] = useState('auto');

  // 生成/轮询状态
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // 歌词生成弹窗状态
  const [lyricsModalOpen, setLyricsModalOpen] = useState(false);
  const [lyricsModalPrompt, setLyricsModalPrompt] = useState('');
  const [lyricsModalResult, setLyricsModalResult] = useState('');
  const [lyricsModalTitle, setLyricsModalTitle] = useState('');
  const [lyricsModalLoading, setLyricsModalLoading] = useState(false);
  const [lyricsModalError, setLyricsModalError] = useState('');

  // 歌词优化弹窗状态
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [optimizeOriginal, setOptimizeOriginal] = useState('');
  const [optimizeResult, setOptimizeResult] = useState('');
  const [optimizeResultTitle, setOptimizeResultTitle] = useState('');
  const [optimizeModalLoading, setOptimizeModalLoading] = useState(false);
  const [optimizeModalError, setOptimizeModalError] = useState('');

  // 生成的歌曲列表
  const [songs, setSongs] = useState<GeneratedSong[]>([]);

  // 重新生成确认弹窗
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);

  // 歌词侧边栏
  const [sidebarSong, setSidebarSong] = useState<GeneratedSong | null>(null);

  // 参考歌曲（当前选中的）
  const [referenceFile, setReferenceFile] = useState<ReferenceFile | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  // 音乐库状态
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'favorites' | 'uploads'>('favorites');
  // 左侧控制面板折叠状态
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // NOTE: 所有上传过的参考歌曲（累积存储）
  const [allReferences, setAllReferences] = useState<ReferenceFile[]>([]);

  // 播放器状态
  const [loopMode, setLoopMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);

  // 播放器状态
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 轮询定时器引用
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // NOTE: 防止 setInterval 异步竞态导致 completed 分支重入（重复扣费）
  const completedRef = useRef(false);

  // 标记是否已完成首次从 localStorage 加载，避免空数组覆盖
  const initializedRef = useRef(false);

  // 清理轮询定时器
  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // ===== localStorage 初始化加载 =====
  useEffect(() => {
    try {
      const savedSongs = scopedStorage.getItem(LS_KEY_SONGS);
      if (savedSongs) setSongs(JSON.parse(savedSongs));

      const savedFavs = scopedStorage.getItem(LS_KEY_FAVORITES);
      if (savedFavs) setFavoriteIds(new Set(JSON.parse(savedFavs)));

      const savedRefs = scopedStorage.getItem(LS_KEY_REFERENCES);
      if (savedRefs) setAllReferences(JSON.parse(savedRefs));
    } catch (e) {
      console.warn('[MusicGen] localStorage load error:', e);
    }

    /**
     * 步骤3：挂载时恢复进行中的轮询（三步闭环）
     * NOTE: 如果 localStorage 中存在未完成的任务，自动重启轮询
     */
    try {
      const savedTask = scopedStorage.getItem(LS_KEY_ACTIVE_TASK);
      if (savedTask) {
        const task: PersistedTask = JSON.parse(savedTask);
        if (task.taskId && task.status === 'polling') {
          // 检查任务是否超过最大轮询时长（避免无限恢复）
          const elapsed = Date.now() - (task.submittedAt || 0);
          if (elapsed < MAX_POLL_DURATION_MS) {
            setGenerating(true);
            // 使用 setTimeout 确保 pollTask 函数已定义
            setTimeout(() => {
              pollTask(task.taskId, task.instrumental);
            }, 100);
          } else {
            // 超时了，清理
            scopedStorage.removeItem(LS_KEY_ACTIVE_TASK);
          }
        }
      }
    } catch { /* ignore */ }

    // NOTE: 延迟标记初始化完成，避免与初始空状态竞争
    requestAnimationFrame(() => { initializedRef.current = true; });
    return () => clearPolling();
  }, [clearPolling]);

  // ===== localStorage 持久化：歌曲列表 =====
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      scopedStorage.setItem(LS_KEY_SONGS, JSON.stringify(songs));
    } catch { /* quota exceeded 等极端情况 */ }
  }, [songs]);

  // ===== localStorage 持久化：收藏 =====
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      scopedStorage.setItem(LS_KEY_FAVORITES, JSON.stringify([...favoriteIds]));
    } catch { /* ignore */ }
  }, [favoriteIds]);

  // ===== localStorage 持久化：上传的参考歌曲 =====
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      scopedStorage.setItem(LS_KEY_REFERENCES, JSON.stringify(allReferences));
    } catch { /* ignore */ }
  }, [allReferences]);

  /** 切换风格标签选中状态 — 同时更新风格输入框文本 */
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const isRemoving = prev.includes(tag);
      const newTags = isRemoving
        ? prev.filter((t) => t !== tag)
        : [...prev, tag];

      // NOTE: 将标签同步写入风格输入框，保持输入框文本与标签选中状态一致
      syncTagsToPrompt(newTags);
      return newTags;
    });
  };

  /**
   * 将选中的标签同步写入 stylePrompt 输入框
   * NOTE: 保留用户手动输入的非标签部分，只替换标签区域
   */
  const syncTagsToPrompt = (tags: string[]) => {
    setStylePrompt((prev) => {
      // 移除旧有的所有标签关键词
      let cleaned = prev;
      for (const t of STYLE_TAGS) {
        // 移除逗号分隔的标签（兼容 ", tag" 和 "tag, " 两种格式）
        cleaned = cleaned.replace(new RegExp(`\\s*,?\\s*${t}\\s*,?`, 'gi'), ',');
      }
      // 清理多余逗号和空白
      cleaned = cleaned.replace(/^[,\s]+|[,\s]+$/g, '').replace(/,{2,}/g, ',');

      const tagPart = tags.join(', ');
      if (cleaned && tagPart) return `${tagPart}, ${cleaned}`;
      if (tagPart) return tagPart;
      return cleaned;
    });
  };

  /** 随机推荐风格标签 */
  const randomizeTags = () => {
    const shuffled = [...STYLE_TAGS].sort(() => Math.random() - 0.5);
    const newTags = shuffled.slice(0, 3 + Math.floor(Math.random() * 3));
    setSelectedTags(newTags);
    syncTagsToPrompt(newTags);
  };

  /** 构建完整的风格 prompt — 标签已同步至 stylePrompt，直接使用 */
  const buildPrompt = (): string => {
    return stylePrompt.trim();
  };

  /** 打开歌词生成弹窗 */
  const openLyricsModal = () => {
    setLyricsModalPrompt('');
    setLyricsModalResult('');
    setLyricsModalTitle('');
    setLyricsModalError('');
    setLyricsModalLoading(false);
    setLyricsModalOpen(true);
  };

  /**
   * 弹窗内 AI 生成歌词
   * @param customPrompt 用户在弹窗输入框中输入的主题/描述
   */
  const handleModalGenerateLyrics = async (customPrompt?: string) => {
    const prompt = customPrompt?.trim() || lyricsModalPrompt.trim() || '一首适合电商营销的朗朗上口的歌曲';
    setLyricsModalLoading(true);
    setLyricsModalError('');
    setLyricsModalResult('');
    try {
      const resp = await fetch('/api/music-gen/lyrics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(parseApiError(errData.detail || ''));
      }
      const data = await resp.json();
      setLyricsModalResult(data.lyrics || '');
      setLyricsModalTitle(data.title || '');
    } catch (err) {
      setLyricsModalError(err instanceof Error ? err.message : '歌词生成失败');
    } finally {
      setLyricsModalLoading(false);
    }
  };

  /** 确认使用弹窗中生成的歌词 */
  const confirmModalLyrics = () => {
    setLyrics(lyricsModalResult);
    if (lyricsModalTitle && !songTitle) {
      setSongTitle(lyricsModalTitle);
    }
    setLyricsModalOpen(false);
  };

  /**
   * 打开优化弹窗并自动触发优化
   * NOTE: 保存当前歌词作为“优化前”，调 API 获取“优化后”
   */
  const openOptimizeModal = async () => {
    if (!lyrics.trim()) return;
    setOptimizeOriginal(lyrics);
    setOptimizeResult('');
    setOptimizeResultTitle('');
    setOptimizeModalError('');
    setOptimizeModalLoading(true);
    setOptimizeModalOpen(true);

    try {
      const resp = await fetch('/api/music-gen/lyrics/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics, prompt: buildPrompt() }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(parseApiError(errData.detail || ''));
      }
      const data = await resp.json();
      setOptimizeResult(data.lyrics || lyrics);
      setOptimizeResultTitle(data.title || '');
    } catch (err) {
      setOptimizeModalError(err instanceof Error ? err.message : '歌词优化失败');
    } finally {
      setOptimizeModalLoading(false);
    }
  };

  /** 弹窗内重新优化 */
  const retryOptimize = async () => {
    setOptimizeModalLoading(true);
    setOptimizeModalError('');
    setOptimizeResult('');
    try {
      const resp = await fetch('/api/music-gen/lyrics/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: optimizeOriginal, prompt: buildPrompt() }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(parseApiError(errData.detail || ''));
      }
      const data = await resp.json();
      setOptimizeResult(data.lyrics || optimizeOriginal);
      setOptimizeResultTitle(data.title || '');
    } catch (err) {
      setOptimizeModalError(err instanceof Error ? err.message : '歌词优化失败');
    } finally {
      setOptimizeModalLoading(false);
    }
  };

  /** 确认使用优化后的歌词 */
  const confirmOptimizedLyrics = () => {
    setLyrics(optimizeResult);
    if (optimizeResultTitle) setSongTitle(optimizeResultTitle);
    setOptimizeModalOpen(false);
  };

  /** 轮询任务状态 */
  const pollTask = (taskId: string, instrumental: boolean) => {
    clearPolling();
    // NOTE: 重置完成标记，允许新的轮询正常执行
    completedRef.current = false;

    pollTimerRef.current = setInterval(async () => {
      try {
        const resp = await fetch(
          `/api/music-gen/task/${taskId}?instrumental=${instrumental}`,
        );
        if (!resp.ok) return;
        const data = await resp.json();

        if (data.status === 'succeeded' && data.choices?.length > 0) {
          // GUARD: 防止异步竞态重入，避免 consumeCredits 被调用两次
          if (completedRef.current) return;
          completedRef.current = true;
          clearPolling();
          setGenerating(false);

          // 将 choices 添加到歌曲列表
          const now = Date.now();
          const newSongs: GeneratedSong[] = data.choices.map(
            (choice: {
              id: string;
              audioUrl: string;
              imageUrl: string;
              lyrics: string;
              title: string;
            }) => ({
              id: choice.id || `${taskId}-${Math.random().toString(36).slice(2, 8)}`,
              title: choice.title || songTitle || '未命名歌曲',
              audioUrl: choice.audioUrl || '',
              imageUrl: choice.imageUrl || '',
              lyrics: choice.lyrics || '',
              status: 'succeeded',
              createdAt: now,
            }),
          );

          /**
           * FIXME: 竞态修复 — 先同步持久化到 localStorage，再清除活跃任务
           * NOTE: 如果组件正在卸载（用户导航离开），setSongs 的 React state 更新
           * 会被丢弃，后续 useEffect([songs]) 永远不会触发持久化。
           * 因此必须在清除 LS_KEY_ACTIVE_TASK 之前，直接写入歌曲数据到 localStorage。
           */
          try {
            const existingRaw = scopedStorage.getItem(LS_KEY_SONGS);
            const existingSongs: GeneratedSong[] = existingRaw ? JSON.parse(existingRaw) : [];
            scopedStorage.setItem(LS_KEY_SONGS, JSON.stringify([...newSongs, ...existingSongs]));
          } catch { /* quota exceeded 等极端情况 */ }

          // 步骤2完成：歌曲已持久化，现在安全地清除活跃任务标记
          try { scopedStorage.removeItem(LS_KEY_ACTIVE_TASK); } catch { /* ignore */ }

          setSongs((prev) => [...newSongs, ...prev]);

          // NOTE: 同步写入资产库和历史记录，供 AssetLibraryPage / HistoryPage 展示
          const dateStr = new Date(now).toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          });
          for (const s of newSongs) {
            addAssetRecordWithSize({
              id: `music-${s.id}`,
              name: `${s.title || '未命名歌曲'}.mp3`,
              source: '数字工厂-AI营销音乐',
              type: 'audio',
              size: '-',
              date: dateStr,
              downloadUrl: s.audioUrl,
              toolId: 'music-generator',
            });
          }
          addHistoryRecord({
            id: `history-music-${taskId}`,
            toolName: 'AI营销音乐',
            action: `生成${isInstrumental ? '纯音乐' : '歌曲'}「${newSongs[0]?.title || songTitle || '未命名'}」`,
            status: 'success',
            time: new Date(now).toISOString(),
            duration: '-',
            output: `已生成 ${newSongs.length} 首${isInstrumental ? '纯音乐' : '歌曲'}，已保存至音乐库。`,
          });

          // NOTE: 成功后扣除积分
          await consumeCredits(newSongs.length * CREDIT_PER_SONG, 'AI营销音乐');
        } else if (
          data.status === 'failed' ||
          data.status === 'timeout' ||
          data.status === 'cancelled'
        ) {
          clearPolling();
          setGenerating(false);
          // 任务失败，清理 localStorage
          try { scopedStorage.removeItem(LS_KEY_ACTIVE_TASK); } catch { /* ignore */ }
          setError(
            data.failedReason || `音乐生成${data.status === 'failed' ? '失败' : data.status === 'timeout' ? '超时' : '已取消'}`,
          );
        }
        // 其他状态（preparing, queued, running 等）继续轮询
      } catch {
        // 网络错误，继续轮询
      }
    }, POLL_INTERVAL_MS);

    // 超时保护
    pollTimeoutRef.current = setTimeout(() => {
      clearPolling();
      setGenerating(false);
      try { scopedStorage.removeItem(LS_KEY_ACTIVE_TASK); } catch { /* ignore */ }
      setError('生成超时，请重试');
    }, MAX_POLL_DURATION_MS);
  };

  /** 提交生成请求 */
  const handleGenerate = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_PER_SONG, '音乐生成')) return;
    const prompt = buildPrompt();
    if (!prompt && !lyrics.trim() && !isInstrumental) {
      setError('请至少输入歌词或风格描述');
      return;
    }
    if (isInstrumental && !prompt) {
      setError('纯音乐模式请输入风格描述');
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const resp = await fetch('/api/music-gen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lyrics: isInstrumental ? '' : lyrics,
          prompt,
          model,
          n: 1,
          instrumental: isInstrumental,
          title: songTitle,
          vocal: isInstrumental ? '' : vocal,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        // NOTE: 将后端返回的原始 API 错误转为用户友好的中文提示
        const rawDetail: string = errData.detail || '';
        throw new Error(parseApiError(rawDetail));
      }

      const data = await resp.json();
      if (data.taskId) {
        // 步骤1：提交时立即持久化 taskId（三步闭环的核心）
        try {
          const persistedTask: PersistedTask = {
            taskId: data.taskId,
            instrumental: isInstrumental,
            status: 'polling',
            submittedAt: Date.now(),
          };
          scopedStorage.setItem(LS_KEY_ACTIVE_TASK, JSON.stringify(persistedTask));
        } catch { /* ignore */ }
        pollTask(data.taskId, isInstrumental);
      } else {
        setGenerating(false);
        setError('未获得任务ID，请重试');
      }
    } catch (err) {
      setGenerating(false);
      setError(err instanceof Error ? err.message : '请求失败');
    }
  };

  /**
   * 将 Mureka API 原始错误信息转为用户友好的中文提示
   * NOTE: 避免前端直接展示冗长的 JSON 错误文本
   */
  const parseApiError = (raw: string): string => {
    if (!raw) return '生成请求失败，请稍后重试';
    const lower = raw.toLowerCase();
    if (lower.includes('exceeded') && lower.includes('quota')) {
      return 'API 调用额度已用尽，请检查账户余额或联系管理员';
    }
    if (lower.includes('rate limit') || lower.includes('too many')) {
      return '请求过于频繁，请稍后再试';
    }
    if (lower.includes('unauthorized') || lower.includes('invalid api key')) {
      return 'API Key 无效或已过期，请联系管理员';
    }
    if (lower.includes('api key 未配置')) {
      return 'Mureka API Key 未配置，请在后端 .env 文件中设置';
    }
    // 未匹配到已知错误，截取合理长度展示
    return raw.length > 80 ? `${raw.slice(0, 80)}...` : raw;
  };

  /** 播放/暂停 */
  const togglePlay = (song: GeneratedSong) => {
    if (!audioRef.current) return;
    if (playingId === song.id) {
      audioRef.current.pause();
      setPlayingId(null);
    } else {
      audioRef.current.src = song.audioUrl;
      audioRef.current.play().catch(() => {});
      setPlayingId(song.id);
    }
  };

  /** 上一首 */
  const playPrev = () => {
    if (songs.length === 0) return;
    const idx = songs.findIndex((s) => s.id === playingId);
    const prevIdx = idx <= 0 ? songs.length - 1 : idx - 1;
    togglePlay(songs[prevIdx]);
  };

  /** 下一首 */
  const playNext = () => {
    if (songs.length === 0) return;
    const idx = songs.findIndex((s) => s.id === playingId);
    const nextIdx = idx >= songs.length - 1 ? 0 : idx + 1;
    togglePlay(songs[nextIdx]);
  };

  /**
   * 进度条拖拽跳转
   * NOTE: mousedown 开始拖拽，mousemove 实时更新进度，mouseup 结束拖拽
   */
  const seekByPosition = useCallback((clientX: number) => {
    if (!audioRef.current || !progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    seekByPosition(e.clientX);

    const handleMouseMove = (ev: MouseEvent) => {
      seekByPosition(ev.clientX);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [seekByPosition]);

  /** 格式化时间 */
  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /** 上传参考歌曲 */
  const handleReferenceUpload = async (file: File) => {
    setReferenceUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await fetch('/api/music-gen/reference/upload', { method: 'POST', body: form });
      if (!resp.ok) throw new Error('上传失败');
      const data = await resp.json();
      const newRef: ReferenceFile = {
        filename: data.filename,
        originalName: data.originalName,
        url: data.url,
        uploadedAt: Date.now(),
      };
      setReferenceFile(newRef);
      // NOTE: 同时将此参考歌曲累积到音乐库的"上传"列表
      setAllReferences((prev) => {
        // 避免重复（按 filename 去重）
        if (prev.some((r) => r.filename === newRef.filename)) return prev;
        return [newRef, ...prev];
      });
    } catch {
      setError('参考歌曲上传失败');
    } finally {
      setReferenceUploading(false);
    }
  };

  /** 删除参考歌曲（仅从当前选中移除） */
  const handleReferenceDelete = async () => {
    if (!referenceFile) return;
    await fetch(`/api/music-gen/reference/${referenceFile.filename}`, { method: 'DELETE' }).catch(() => {});
    setReferenceFile(null);
  };

  /** 切换歌曲收藏状态 */
  const toggleFavorite = (songId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }
      return next;
    });
  };

  /** 从音乐库中删除上传的参考歌曲 */
  const removeReference = async (filename: string) => {
    await fetch(`/api/music-gen/reference/${filename}`, { method: 'DELETE' }).catch(() => {});
    setAllReferences((prev) => prev.filter((r) => r.filename !== filename));
    // 如果当前选中的参考歌曲就是被删除的，清空选中
    if (referenceFile?.filename === filename) setReferenceFile(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 隐藏的 audio 元素 */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => {
          if (loopMode && playingId) {
            audioRef.current?.play().catch(() => {});
          } else {
            playNext();
          }
        }}
        className="hidden"
      />
      {/* 隐藏文件上传 input */}
      <input
        ref={refInputRef}
        type="file"
        accept=".mp3,.wav,.flac,.m4a,.ogg,.aac"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleReferenceUpload(f);
          e.target.value = '';
        }}
      />

      {/* ======= 主内容区 ======= */}
      {libraryOpen ? (
        /* ======= 音乐库面板 ======= */
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* 音乐库头部 */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLibraryOpen(false)}
                className="cursor-target w-8 h-8 rounded-lg bg-nexus-surface border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
                title="返回创作"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="flex items-center gap-2">
                <Library size={18} className="text-nexus-primary" />
                <h2 className="text-base font-bold text-nexus-text">音乐库</h2>
              </div>
            </div>
            {/* 分页导航 */}
            <div className="flex items-center gap-1 bg-nexus-bg rounded-xl p-1 border border-nexus-border/50">
              <button
                onClick={() => setLibraryTab('favorites')}
                className={`cursor-target px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  libraryTab === 'favorites'
                    ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/30'
                    : 'text-nexus-muted hover:text-nexus-text border border-transparent'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Heart size={12} />
                  收藏
                  {favoriteIds.size > 0 && (
                    <span className="bg-rose-500/20 text-rose-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {favoriteIds.size}
                    </span>
                  )}
                </span>
              </button>
              <button
                onClick={() => setLibraryTab('uploads')}
                className={`cursor-target px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  libraryTab === 'uploads'
                    ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/30'
                    : 'text-nexus-muted hover:text-nexus-text border border-transparent'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Upload size={12} />
                  上传
                  {allReferences.length > 0 && (
                    <span className="bg-nexus-primary/15 text-nexus-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {allReferences.length}
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>

          {/* 音乐库内容 */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {libraryTab === 'favorites' ? (
              /* ====== 收藏分页 ====== */
              (() => {
                const favSongs = songs.filter((s) => favoriteIds.has(s.id));
                return favSongs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-20">
                    <Heart size={36} className="text-nexus-border mb-4" />
                    <p className="text-sm text-nexus-muted mb-1">暂无收藏的歌曲</p>
                    <p className="text-[11px] text-nexus-muted/50">点击歌曲卡片上的 ❤ 按钮收藏喜欢的音乐</p>
                  </div>
                ) : (
                  favSongs.map((song) => (
                    <motion.div
                      key={song.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-nexus-surface/60 border border-nexus-border rounded-2xl p-4 hover:border-nexus-primary/20 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        {/* 封面 + 播放 */}
                        <div className="relative flex-shrink-0">
                          <div
                            className="w-14 h-14 rounded-xl overflow-hidden bg-nexus-bg border border-nexus-border flex items-center justify-center cursor-pointer"
                            style={{
                              backgroundImage: song.imageUrl ? `url(${song.imageUrl})` : 'none',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                            onClick={() => { if (song.audioUrl) togglePlay(song); }}
                          >
                            {!song.imageUrl && <Music size={20} className="text-nexus-primary/40" />}
                          </div>
                          {song.audioUrl && (
                            <button
                              onClick={() => togglePlay(song)}
                              className="cursor-target absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl"
                            >
                              {playingId === song.id ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-0.5" />}
                            </button>
                          )}
                        </div>
                        {/* 信息 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-nexus-text truncate">{song.title || '未命名歌曲'}</p>
                          {song.lyrics && (
                            <p className="text-[10px] text-nexus-muted mt-1 truncate">{song.lyrics.split('\n')[0]}</p>
                          )}
                          {song.createdAt && (
                            <p className="text-[10px] text-nexus-muted/50 mt-0.5">
                              {new Date(song.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {/* 操作 */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => toggleFavorite(song.id)}
                            className="cursor-target w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center transition-all hover:bg-rose-500/25"
                            title="取消收藏"
                          >
                            <Heart size={14} fill="currentColor" />
                          </button>
                          {song.audioUrl && (
                            <a
                              href={song.audioUrl}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cursor-target w-8 h-8 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
                              title="下载"
                            >
                              <Download size={14} />
                            </a>
                          )}
                          <button
                            onClick={() => setSidebarSong(sidebarSong?.id === song.id ? null : song)}
                            className={`cursor-target w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                              sidebarSong?.id === song.id
                                ? 'bg-nexus-primary/15 border-nexus-primary/30 text-nexus-primary'
                                : 'bg-nexus-bg border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30'
                            }`}
                            title="查看歌词"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                );
              })()
            ) : (
              /* ====== 上传分页 ====== */
              <>
                {/* 上传按钮 */}
                <button
                  onClick={() => refInputRef.current?.click()}
                  disabled={referenceUploading}
                  className="cursor-target w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 text-xs transition-all disabled:opacity-50"
                >
                  {referenceUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {referenceUploading ? '上传中...' : '上传参考歌曲'}
                </button>
                {allReferences.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-16">
                    <Upload size={36} className="text-nexus-border mb-4" />
                    <p className="text-sm text-nexus-muted mb-1">暂无上传的参考歌曲</p>
                    <p className="text-[11px] text-nexus-muted/50">上传的参考音乐将保存在此</p>
                  </div>
                ) : (
                  allReferences.map((ref) => (
                    <motion.div
                      key={ref.filename}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-nexus-surface/60 border border-nexus-border rounded-2xl p-4 hover:border-nexus-primary/20 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center flex-shrink-0">
                          <Music size={16} className="text-nexus-primary/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-nexus-text truncate">{ref.originalName}</p>
                          {ref.uploadedAt && (
                            <p className="text-[10px] text-nexus-muted/50 mt-0.5">
                              {new Date(ref.uploadedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* 试听 */}
                          <audio src={ref.url} controls className="h-6 w-20" style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.5 }} />
                          {/* 删除 */}
                          <button
                            onClick={() => removeReference(ref.filename)}
                            className="cursor-target w-7 h-7 rounded-md flex items-center justify-center text-nexus-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="删除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      ) : (
      /* ======= 创作主面板 ======= */
      <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">

      <div
        className={`flex-shrink-0 overflow-y-auto pr-1 transition-all duration-300 ease-in-out ${
          panelCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-[420px] space-y-4'
        }`}
      >
        {/* 音乐库入口 + 模型选择 + 折叠按钮 */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setLibraryOpen(true)}
            className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 bg-nexus-surface transition-all"
          >
            <Library size={13} />
            音乐库
            {favoriteIds.size > 0 && (
              <span className="bg-rose-500/20 text-rose-400 text-[9px] px-1 py-0.5 rounded-full font-bold leading-none">
                {favoriteIds.size}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1.5">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="cursor-target bg-nexus-surface border border-nexus-border rounded-lg px-3 py-1.5 text-xs text-nexus-text outline-none focus:border-nexus-primary/50 transition-colors"
          >
            {MUREKA_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
            {/* 折叠左侧栏按钮 */}
            <button
              onClick={() => setPanelCollapsed(true)}
              className="cursor-target w-7 h-7 rounded-md bg-nexus-surface border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all flex-shrink-0"
              title="收起左侧栏"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>

        {/* 歌词区域 */}
        <div className="bg-nexus-surface/60 border border-nexus-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-nexus-text">歌词</span>
            <div className="flex items-center gap-2">
              {/* 一键清空歌词 */}
              {lyrics.trim() && !isInstrumental && (
                <button
                  onClick={() => setLyrics('')}
                  className="cursor-target w-6 h-6 rounded-md flex items-center justify-center text-nexus-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="清空歌词"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {/* 纯音乐开关 */}
              <button
                onClick={() => setIsInstrumental(!isInstrumental)}
                className={`cursor-target flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  isInstrumental
                    ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/30'
                    : 'bg-nexus-bg text-nexus-muted border border-nexus-border hover:border-nexus-primary/20'
                }`}
              >
                <div
                  className={`w-6 h-3 rounded-full relative transition-colors ${
                    isInstrumental ? 'bg-nexus-primary' : 'bg-nexus-border'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-transform ${
                      isInstrumental ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                纯音乐
              </button>
            </div>
          </div>

          {/* 歌词输入框 — 纯音乐模式下隐藏 */}
          <AnimatePresence>
            {!isInstrumental && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="在此输入歌词"
                  maxLength={3000}
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 transition-all resize-y leading-relaxed min-h-[120px] max-h-[400px]"
                />
                {/* 操作按钮行 */}
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={openOptimizeModal}
                    disabled={!lyrics.trim()}
                    className="cursor-target flex items-center gap-1 text-[11px] text-nexus-muted hover:text-nexus-primary transition-colors disabled:opacity-40"
                  >
                    <Sparkles size={12} />
                    优化
                  </button>
                  <button
                    onClick={openLyricsModal}
                    className="cursor-target flex items-center gap-1 text-[11px] text-nexus-muted hover:text-nexus-primary transition-colors"
                  >
                    <FileText size={12} />
                    生成歌词
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 风格区域 */}
        <div className="bg-nexus-surface/60 border border-nexus-border rounded-2xl p-4 space-y-3">
          <span className="text-xs font-bold text-nexus-text">风格</span>
          <textarea
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="输入风格、情绪、乐器等来控制生成的音乐"
            rows={3}
            maxLength={1024}
            className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 transition-all resize-none"
          />
          {/* 推荐标签 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={randomizeTags}
              className="cursor-target w-7 h-7 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
            >
              <RefreshCw size={12} />
            </button>
            {STYLE_TAGS.slice(0, 8).map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`cursor-target px-2.5 py-1 rounded-lg text-[11px] border transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-nexus-primary/10 border-nexus-primary/40 text-nexus-primary'
                    : 'bg-nexus-bg border-nexus-border text-nexus-muted hover:border-nexus-primary/20'
                }`}
              >
                + {tag}
              </button>
            ))}
          </div>
          {/* 更多标签 — 折叠展示 */}
          {STYLE_TAGS.length > 8 && (
            <div className="flex items-center gap-2 flex-wrap">
              {STYLE_TAGS.slice(8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`cursor-target px-2.5 py-1 rounded-lg text-[11px] border transition-all ${
                    selectedTags.includes(tag)
                      ? 'bg-nexus-primary/10 border-nexus-primary/40 text-nexus-primary'
                      : 'bg-nexus-bg border-nexus-border text-nexus-muted hover:border-nexus-primary/20'
                  }`}
                >
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 人声性别 — 仅在非纯音乐模式显示 */}
        <AnimatePresence>
          {!isInstrumental && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-nexus-surface/60 border border-nexus-border rounded-2xl px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-nexus-text">
                  人声性别
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setVocal('female')}
                    className={`cursor-target px-3 py-1 rounded-lg text-xs transition-all ${
                      vocal === 'female'
                        ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/30'
                        : 'text-nexus-muted hover:text-nexus-text border border-transparent'
                    }`}
                  >
                    女声
                  </button>
                  <button
                    onClick={() => setVocal('male')}
                    className={`cursor-target px-3 py-1 rounded-lg text-xs transition-all ${
                      vocal === 'male'
                        ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/30'
                        : 'text-nexus-muted hover:text-nexus-text border border-transparent'
                    }`}
                  >
                    男声
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 歌名输入 */}
        <div className="bg-nexus-surface/60 border border-nexus-border rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-nexus-text">歌名</span>
            <span className="text-[10px] text-nexus-muted">
              {songTitle.length}/50
            </span>
          </div>
          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value.slice(0, 50))}
            placeholder="歌名"
            className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 transition-all"
          />
        </div>

        {/* 参考歌曲 */}
        <div className="bg-nexus-surface/60 border border-nexus-border rounded-2xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-nexus-text">参考歌曲</span>
            {referenceFile && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => refInputRef.current?.click()}
                  className="cursor-target w-6 h-6 rounded-md flex items-center justify-center text-nexus-muted hover:text-nexus-primary transition-all"
                  title="重新选择"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  onClick={handleReferenceDelete}
                  className="cursor-target w-6 h-6 rounded-md flex items-center justify-center text-nexus-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
          {referenceFile ? (
            <div className="flex items-center gap-3 bg-nexus-bg border border-nexus-border rounded-xl px-3 py-2.5">
              <Music size={16} className="text-nexus-primary flex-shrink-0" />
              <span className="text-xs text-nexus-text truncate flex-1">{referenceFile.originalName}</span>
              <audio src={referenceFile.url} controls className="h-6 w-24 flex-shrink-0" style={{ filter: 'invert(1) hue-rotate(180deg)', opacity: 0.6 }} />
            </div>
          ) : (
            <button
              onClick={() => refInputRef.current?.click()}
              disabled={referenceUploading}
              className="cursor-target w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 text-xs transition-all disabled:opacity-50"
            >
              {referenceUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {referenceUploading ? '上传中...' : '上传参考歌曲'}
            </button>
          )}
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-red-400 flex items-center justify-between"
            >
              <span>{error}</span>
              <button
                onClick={() => setError('')}
                className="cursor-target text-red-400/60 hover:text-red-400"
              >
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 创作按钮 */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="cursor-target w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: generating
              ? 'linear-gradient(135deg, rgba(62,237,231,0.3), rgba(94,184,172,0.3))'
              : 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
            color: generating ? 'var(--color-nexus-primary)' : 'var(--color-nexus-inverse)',
            boxShadow: generating
              ? 'none'
              : '0 4px 24px rgba(62,237,231,0.3)',
          }}
        >
          {generating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Music size={16} />
              创作
            </>
          )}
        </button>

        {/* 积分消耗提示 */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-nexus-muted/60">
          <Zap size={10} />
          <span>
            本次生成消耗 <strong className="text-nexus-muted">{CREDIT_PER_SONG}</strong>{' '}
            算力 · 内容由AI生成
          </span>
        </div>
      </div>

      {/* 折叠时的展开按钮 — 独立竖条，不覆盖歌曲列表 */}
      {panelCollapsed && (
        <button
          onClick={() => setPanelCollapsed(false)}
          className="cursor-target flex-shrink-0 w-6 h-full flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface/60 transition-all border-r border-nexus-border/30"
          title="展开左侧栏"
        >
          <PanelLeftOpen size={15} />
        </button>
      )}

      {/* ======= 右侧歌曲列表 ======= */}
      <div className="flex-1 min-w-0">
        {songs.length === 0 && !generating ? (
          /* 空状态 */
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              {/* 唱片动画 */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                className="w-20 h-20 rounded-full border-4 border-nexus-border flex items-center justify-center"
                style={{
                  background:
                    'radial-gradient(circle, var(--color-nexus-surface) 30%, var(--color-nexus-bg) 70%)',
                }}
              >
                <div className="w-4 h-4 rounded-full bg-nexus-primary/30 border border-nexus-primary/50" />
              </motion.div>
              <Music
                size={24}
                className="absolute -top-1 -right-1 text-nexus-primary"
              />
            </div>
            <p className="text-sm text-nexus-muted">暂无歌曲，快去创作吧！</p>
          </div>
        ) : (
          /* 歌曲列表 */
          <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
            {/* 生成中状态卡片 */}
            <AnimatePresence>
              {generating && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-nexus-surface/60 border border-nexus-primary/20 rounded-2xl p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    >
                      <Disc3 size={20} className="text-nexus-primary" />
                    </motion.div>
                    <div>
                      <p className="text-sm font-bold text-nexus-text">
                        AI 正在创作音乐...
                      </p>
                      <p className="text-[10px] text-nexus-muted mt-0.5">
                        预计需要 1-3 分钟，请耐心等待
                      </p>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-nexus-bg rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          'linear-gradient(90deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                      }}
                      initial={{ width: '0%' }}
                      animate={{ width: '80%' }}
                      transition={{ duration: 60, ease: 'easeInOut' }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 已生成歌曲列表 */}
            {songs.map((song, index) => (
              <motion.div
                key={song.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-nexus-surface/60 border border-nexus-border rounded-2xl p-4 hover:border-nexus-primary/20 transition-all group cursor-pointer"
                onClick={() => { if (song.audioUrl) togglePlay(song); }}
              >
                <div className="flex items-center gap-4">
                  {/* 封面图 / 播放按钮 */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-14 h-14 rounded-xl overflow-hidden bg-nexus-bg border border-nexus-border flex items-center justify-center"
                      style={{
                        backgroundImage: song.imageUrl
                          ? `url(${song.imageUrl})`
                          : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      {!song.imageUrl && (
                        <Music size={20} className="text-nexus-primary/40" />
                      )}
                    </div>
                    {/* 播放按钮叠加层 — 始终可见 */}
                    {song.audioUrl && (
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePlay(song); }}
                        className="cursor-target absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl transition-opacity"
                      >
                        {playingId === song.id ? (
                          <Pause size={20} className="text-white" />
                        ) : (
                          <Play
                            size={20}
                            className="text-white ml-0.5"
                          />
                        )}
                      </button>
                    )}
                  </div>

                  {/* 歌曲信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-nexus-text truncate">
                      {song.title || '未命名歌曲'}
                    </p>
                    {song.lyrics && (
                      <p className="text-[10px] text-nexus-muted mt-1 truncate leading-relaxed">
                        {song.lyrics.split('\n')[0]}
                      </p>
                    )}
                  </div>

                  {/* 操作按钮：收藏 / 下载 / 查看 / 重新生成 */}
                  {/* NOTE: 按钮始终可见，不再 hover 才出现 */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 收藏按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(song.id); }}
                      className={`cursor-target w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                        favoriteIds.has(song.id)
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                          : 'bg-nexus-bg border-nexus-border text-nexus-muted hover:text-rose-400 hover:border-rose-400/30'
                      }`}
                      title={favoriteIds.has(song.id) ? '取消收藏' : '收藏'}
                    >
                      <Heart size={14} fill={favoriteIds.has(song.id) ? 'currentColor' : 'none'} />
                    </button>
                    {song.audioUrl && (
                      <a
                        href={song.audioUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-target w-8 h-8 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
                        title="下载"
                      >
                        <Download size={14} />
                      </a>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setSidebarSong(sidebarSong?.id === song.id ? null : song); }}
                      className={`cursor-target w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                        sidebarSong?.id === song.id
                          ? 'bg-nexus-primary/15 border-nexus-primary/30 text-nexus-primary'
                          : 'bg-nexus-bg border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30'
                      }`}
                      title="查看歌词"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setRegenConfirmOpen(true); }}
                      disabled={generating}
                      className="cursor-target w-8 h-8 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all disabled:opacity-40"
                      title="重新生成"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>

                {/* 播放状态指示 — 当前歌曲正在播放时显示简化波纹 */}
                <AnimatePresence>
                  {playingId === song.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-2 flex items-center gap-1"
                    >
                      <div className="flex items-end gap-[2px] h-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-[3px] rounded-full bg-nexus-primary"
                            animate={{ height: [3, 10, 3] }}
                            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-nexus-primary ml-1">播放中</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ======= 歌词侧边栏 ======= */}
      <AnimatePresence>
        {sidebarSong && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="flex-shrink-0 overflow-hidden border-l border-nexus-border/50"
          >
            <div className="w-[320px] h-full flex flex-col bg-nexus-surface/80 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-nexus-primary" />
                  <span className="text-xs font-bold text-nexus-text truncate max-w-[200px]">
                    {sidebarSong.title || '未命名歌曲'}
                  </span>
                </div>
                <button
                  onClick={() => setSidebarSong(null)}
                  className="cursor-target w-6 h-6 rounded-md flex items-center justify-center text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface transition-all"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <pre className="text-[13px] text-[#B0B8C4] leading-relaxed whitespace-pre-wrap font-sans">
                  {sidebarSong.lyrics}
                </pre>
              </div>
              {/* 侧边栏播放按钮 */}
              {sidebarSong.audioUrl && (
                <button
                  onClick={() => togglePlay(sidebarSong)}
                  className="cursor-target mt-3 w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: playingId === sidebarSong.id
                      ? 'rgba(62,237,231,0.15)'
                      : 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                    color: playingId === sidebarSong.id ? 'var(--color-nexus-primary)' : 'var(--color-nexus-inverse)',
                  }}
                >
                  {playingId === sidebarSong.id ? <><Pause size={14} /> 暂停</> : <><Play size={14} /> 播放</>}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
      )}
      {/* 创作主面板 / 音乐库 条件渲染结束 */}
      {/* ======= 歌词生成弹窗 ======= */}
      <AnimatePresence>
        {lyricsModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
            onClick={(e) => {
              // NOTE: 点击背景关闭弹窗，避免内容区域点击冒泡
              if (e.target === e.currentTarget) setLyricsModalOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-[680px] max-w-[90vw] h-[600px] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: 'linear-gradient(180deg, #1a1825 0%, #12101c 100%)',
                border: '1px solid rgba(58, 63, 88, 0.5)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              }}
            >
              {/* 关闭按钮 */}
              <button
                onClick={() => setLyricsModalOpen(false)}
                className="cursor-target absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface transition-all"
              >
                <X size={18} />
              </button>

              {/* 中间内容区 — 展示生成结果或引导文字 */}
              <div className="flex-1 overflow-y-auto px-8 pt-16 pb-6 flex flex-col items-center justify-center">
                {lyricsModalLoading ? (
                  /* 生成中动画 */
                  <div className="flex flex-col items-center gap-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Wand2 size={32} className="text-nexus-primary" />
                    </motion.div>
                    <p className="text-sm text-nexus-muted animate-pulse">
                      AI 正在创作歌词...
                    </p>
                  </div>
                ) : lyricsModalError ? (
                  /* 错误状态 */
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-6 py-4 max-w-md">
                      <p className="text-sm text-red-400 text-center">{lyricsModalError}</p>
                    </div>
                    <button
                      onClick={() => handleModalGenerateLyrics()}
                      className="cursor-target flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus-surface border border-nexus-border text-xs text-nexus-text hover:border-nexus-primary/30 transition-all"
                    >
                      <RotateCcw size={12} />
                      重新生成
                    </button>
                  </div>
                ) : lyricsModalResult ? (
                  /* 歌词结果展示 */
                  <div className="w-full max-w-lg space-y-5">
                    {lyricsModalTitle && (
                      <h3 className="text-center text-lg font-bold text-nexus-text">
                        {lyricsModalTitle}
                      </h3>
                    )}
                    <div className="bg-nexus-bg/60 border border-nexus-border/50 rounded-xl p-5 max-h-[320px] overflow-y-auto">
                      <pre className="text-sm text-nexus-text/90 leading-relaxed whitespace-pre-wrap font-sans">
                        {lyricsModalResult}
                      </pre>
                    </div>
                    {/* 操作按钮行 */}
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleModalGenerateLyrics()}
                        className="cursor-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs border border-nexus-border text-nexus-muted hover:text-nexus-text hover:border-nexus-primary/30 bg-nexus-surface transition-all"
                      >
                        <RotateCcw size={13} />
                        重新生成
                      </button>
                      <button
                        onClick={confirmModalLyrics}
                        className="cursor-target flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                          color: 'var(--color-nexus-inverse)',
                          boxShadow: '0 4px 16px rgba(62,237,231,0.3)',
                        }}
                      >
                        <Check size={13} />
                        使用这段歌词
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 空状态 — 引导文字 */
                  <p className="text-sm text-nexus-muted/60">
                    输入您的歌词创作想法。
                  </p>
                )}
              </div>

              {/* 底部输入区 */}
              <div className="px-6 pb-6 pt-2">
                <div
                  className="relative rounded-xl overflow-hidden"
                  style={{
                    border: '1px solid rgba(58, 63, 88, 0.6)',
                    background: '#1e1c28',
                  }}
                >
                  <textarea
                    value={lyricsModalPrompt}
                    onChange={(e) => setLyricsModalPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      // NOTE: Ctrl+Enter 快捷提交
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleModalGenerateLyrics();
                      }
                    }}
                    placeholder="说明您想要的歌词类型，或告诉我一个主题或话题。"
                    rows={3}
                    className="cursor-target w-full bg-transparent px-4 py-3 pr-40 text-sm text-nexus-text placeholder-nexus-muted/40 outline-none resize-none leading-relaxed"
                    disabled={lyricsModalLoading}
                  />
                  {/* 右下角按钮组 */}
                  <div className="absolute bottom-2.5 right-3 flex items-center gap-2">
                    {/* 生成随机歌词 — 模仿截图中的按钮 */}
                    <button
                      onClick={() => handleModalGenerateLyrics('随机创作一首有感染力的歌曲歌词')}
                      disabled={lyricsModalLoading}
                      className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 bg-nexus-surface border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30"
                    >
                      <Wand2 size={13} />
                      生成随机歌词
                    </button>
                    {/* 发送按钮 — 仅在输入内容后显示 */}
                    {lyricsModalPrompt.trim() && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => handleModalGenerateLyrics()}
                        disabled={lyricsModalLoading}
                        className="cursor-target w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                          boxShadow: '0 2px 12px rgba(62,237,231,0.3)',
                        }}
                      >
                        <Send size={14} className="text-nexus-inverse" />
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======= 歌词优化对比弹窗 ======= */}
      <AnimatePresence>
        {optimizeModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOptimizeModalOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-[860px] max-w-[92vw] h-[80vh] rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: 'linear-gradient(180deg, #1a1825 0%, #12101c 100%)',
                border: '1px solid rgba(58, 63, 88, 0.5)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-nexus-primary" />
                  <span className="text-sm font-bold text-nexus-text">歌词优化对比</span>
                </div>
                <button
                  onClick={() => setOptimizeModalOpen(false)}
                  className="cursor-target w-8 h-8 rounded-lg flex items-center justify-center text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 内容区 — 左右对比，min-h-0 让 flex 子元素 overflow-y-auto 生效 */}
              <div className="flex-1 min-h-0 px-6 pb-4">
                {optimizeModalLoading ? (
                  /* 加载中 */
                  <div className="h-full flex flex-col items-center justify-center gap-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles size={32} className="text-nexus-primary" />
                    </motion.div>
                    <p className="text-sm text-nexus-muted animate-pulse">
                      AI 正在优化歌词...
                    </p>
                  </div>
                ) : optimizeModalError ? (
                  /* 错误状态 */
                  <div className="h-full flex flex-col items-center justify-center gap-4">
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-6 py-4 max-w-md">
                      <p className="text-sm text-red-400 text-center">{optimizeModalError}</p>
                    </div>
                    <button
                      onClick={retryOptimize}
                      className="cursor-target flex items-center gap-2 px-4 py-2 rounded-lg bg-nexus-surface border border-nexus-border text-xs text-nexus-text hover:border-nexus-primary/30 transition-all"
                    >
                      <RotateCcw size={12} />
                      重新优化
                    </button>
                  </div>
                ) : (
                  /* 左右对比布局 */
                  <div className="flex gap-4 h-full">
                    {/* 左侧 — 原始歌词 */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-bold text-nexus-muted uppercase tracking-wider">优化前</span>
                      </div>
                      <div className="flex-1 bg-nexus-bg/60 border border-nexus-border/40 rounded-xl p-4 overflow-y-auto">
                        <pre className="text-[13px] text-nexus-muted leading-relaxed whitespace-pre-wrap font-sans">
                          {optimizeOriginal}
                        </pre>
                      </div>
                    </div>

                    {/* 中间箭头 */}
                    <div className="flex items-center flex-shrink-0 px-1">
                      <div className="w-8 h-8 rounded-full bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
                        <ArrowRight size={14} className="text-nexus-primary" />
                      </div>
                    </div>

                    {/* 右侧 — 优化后歌词 */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-bold text-nexus-primary uppercase tracking-wider">优化后</span>
                        {optimizeResultTitle && (
                          <span className="text-[10px] text-nexus-muted">- {optimizeResultTitle}</span>
                        )}
                      </div>
                      <div className="flex-1 bg-nexus-bg/80 border border-nexus-primary/15 rounded-xl p-4 overflow-y-auto">
                        <pre className="text-[13px] text-nexus-text leading-relaxed whitespace-pre-wrap font-sans">
                          {optimizeResult}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 底部操作栏 */}
              {!optimizeModalLoading && !optimizeModalError && optimizeResult && (
                <div className="flex items-center justify-center gap-3 px-6 pb-5 pt-2">
                  <button
                    onClick={() => setOptimizeModalOpen(false)}
                    className="cursor-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs border border-nexus-border text-nexus-muted hover:text-nexus-text hover:border-nexus-primary/30 bg-nexus-surface transition-all"
                  >
                    保留原版
                  </button>
                  <button
                    onClick={retryOptimize}
                    className="cursor-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs border border-nexus-border text-nexus-muted hover:text-nexus-text hover:border-nexus-primary/30 bg-nexus-surface transition-all"
                  >
                    <RotateCcw size={13} />
                    再次优化
                  </button>
                  <button
                    onClick={confirmOptimizedLyrics}
                    className="cursor-target flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                      color: 'var(--color-nexus-inverse)',
                      boxShadow: '0 4px 16px rgba(62,237,231,0.3)',
                    }}
                  >
                    <Check size={13} />
                    使用优化版
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======= 重新生成确认弹窗 ======= */}
      <AnimatePresence>
        {regenConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setRegenConfirmOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-[380px] max-w-[90vw] rounded-2xl overflow-hidden"
              style={{
                background: `linear-gradient(180deg, var(--color-nexus-surface) 0%, var(--color-nexus-bg) 100%)`,
                border: '1px solid var(--color-nexus-border)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
              }}
            >
              {/* 图标 + 标题 */}
              <div className="px-6 pt-6 pb-2 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
                  <AlertTriangle size={22} className="text-amber-400" />
                </div>
                <h3 className="text-sm font-bold text-nexus-text">确认重新生成</h3>
              </div>
              {/* 提示内容 */}
              <div className="px-6 py-3">
                <p className="text-xs text-nexus-muted text-center leading-relaxed">
                  重新生成将使用当前的歌词与风格参数创作新的音乐，
                  本次操作将消耗{' '}
                  <strong className="text-nexus-primary">{CREDIT_PER_SONG} 算力</strong>。
                </p>
              </div>
              {/* 按钮 */}
              <div className="px-6 pb-5 pt-2 flex items-center justify-center gap-3">
                <button
                  onClick={() => setRegenConfirmOpen(false)}
                  className="cursor-target flex-1 py-2.5 rounded-xl text-xs font-medium border border-nexus-border text-nexus-muted hover:text-nexus-text hover:border-nexus-primary/30 bg-nexus-surface transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setRegenConfirmOpen(false);
                    handleGenerate();
                  }}
                  className="cursor-target flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                    color: 'var(--color-nexus-inverse)',
                    boxShadow: '0 4px 16px rgba(62,237,231,0.25)',
                  }}
                >
                  <Zap size={12} />
                  确认生成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======= 底部播放器 ======= */}
      {songs.length > 0 && (
        <div className="flex-shrink-0 border-t border-nexus-border/50 bg-nexus-surface/95 px-6 py-3">
          <div className="flex items-center gap-4">
            {/* 歌曲名 */}
            <div className="w-[180px] flex-shrink-0 truncate text-xs font-bold text-nexus-text">
              {playingId ? songs.find((s) => s.id === playingId)?.title || '未命名歌曲' : '未播放'}
            </div>

            {/* 控制按钮组 */}
            <div className="flex items-center gap-2">
              <button onClick={playPrev} className="cursor-target w-8 h-8 rounded-full flex items-center justify-center text-nexus-muted hover:text-nexus-text transition-colors" title="上一首">
                <SkipBack size={16} />
              </button>
              <button
                onClick={() => { if (playingId) { const s = songs.find((x) => x.id === playingId); if (s) togglePlay(s); } else if (songs[0]?.audioUrl) togglePlay(songs[0]); }}
                className="cursor-target w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'linear-gradient(135deg, var(--color-nexus-primary), var(--color-nexus-secondary))', color: 'var(--color-nexus-inverse)' }}
              >
                {playingId ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>
              <button onClick={playNext} className="cursor-target w-8 h-8 rounded-full flex items-center justify-center text-nexus-muted hover:text-nexus-text transition-colors" title="下一首">
                <SkipForward size={16} />
              </button>
              <button
                onClick={() => setLoopMode(!loopMode)}
                className={`cursor-target w-8 h-8 rounded-full flex items-center justify-center transition-colors ${loopMode ? 'text-nexus-primary' : 'text-nexus-muted hover:text-nexus-text'}`}
                title="循环播放"
              >
                <Repeat size={14} />
              </button>
            </div>

            {/* 进度条 */}
            <span className="text-[10px] text-nexus-muted w-10 text-right flex-shrink-0">{fmtTime(currentTime)}</span>
            <div
              ref={progressRef}
              onMouseDown={handleProgressMouseDown}
              className="cursor-target flex-1 h-1.5 bg-nexus-surface rounded-full overflow-hidden cursor-pointer group relative"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: duration ? `${(currentTime / duration) * 100}%` : '0%',
                  background: 'linear-gradient(90deg, var(--color-nexus-primary), var(--color-nexus-secondary))',
                }}
              />
              {/* 拖拽手柄 */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-nexus-primary shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }}
              />
            </div>
            <span className="text-[10px] text-nexus-muted w-10 flex-shrink-0">{fmtTime(duration)}</span>

            {/* 查看歌词 */}
            <button
              onClick={() => {
                if (playingId) {
                  const s = songs.find((x) => x.id === playingId);
                  if (s) setSidebarSong(sidebarSong?.id === s.id ? null : s);
                }
              }}
              className={`cursor-target w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                sidebarSong && playingId && sidebarSong.id === playingId
                  ? 'text-nexus-primary bg-nexus-primary/10'
                  : 'text-nexus-muted hover:text-nexus-text'
              }`}
              title="查看歌词"
            >
              <Eye size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
