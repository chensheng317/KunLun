import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2,
  Play,
  Pause,
  Download,
  Loader2,
  Mic,
  Zap,
  Settings2,
  ChevronDown,
  RotateCcw,
  Search,
  Hash,
  Clock,
  X,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import VoiceClonePanel from './VoiceClonePanel';
import {
  MAX_TEXT_LENGTH,
  CREDIT_PER_SYNTHESIS,
  MOOD_TAGS,
  useAudioPlayer,
  useTtsApi,
} from './tts-utils';
import type { SynthesisResult } from './tts-utils';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';

/**
 * 语音合成工具组件 — 完整功能版
 * NOTE: 创新布局 = 左侧垂直功能导航 + 右侧主内容区
 * 包含两大功能模块：语音合成 & 音色克隆
 * 配色遵循 配色.md nexus 赛博工业风规范
 */

type ActiveTab = 'synthesis' | 'clone';

/** 语言筛选分类 */
const LANGUAGE_FILTERS = ['全部', '中文', '粤语', '英文', '日文', '韩文', '多语种'];

// localStorage 持久化 key
const LS_KEY_TTS_RESULT = 'kunlun_tts_last_result';
const LS_KEY_CLONED_VOICES = 'kunlun_tts_cloned_voices';
const LS_KEY_KEEPALIVE = 'kunlun_tts_keepalive';

/** 克隆音色条目（含过期时间） */
interface ClonedVoiceEntry {
  id: string;
  /** 最后一次使用时间（ISO 字符串） */
  lastUsedAt: string;
}

/** 保活配置 */
interface KeepAliveConfig {
  voiceId: string;
  /** 保活周期（天） */
  intervalDays: number;
  /** 是否启用 */
  enabled: boolean;
  /** 上次保活时间（ISO 字符串） */
  lastKeptAt: string;
}

/** 保活周期选项 */
const KEEPALIVE_OPTIONS = [
  { days: 3, label: '每 3 天', creditPerMonth: 50 },
  { days: 5, label: '每 5 天', creditPerMonth: 30 },
  { days: 6, label: '每 6 天（最省）', creditPerMonth: 25 },
];

/** 保活短文本 — 用于续命合成 */
const KEEPALIVE_TEXT = '你好，这是一段保活测试语音。';

/** 计算距离过期还剩多少天 */
function daysUntilExpiry(lastUsedAt: string): number {
  const lastUsed = new Date(lastUsedAt).getTime();
  const expiresAt = lastUsed + 7 * 24 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

export default function TtsSynthesisTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  const [activeTab, setActiveTab] = useState<ActiveTab>('synthesis');

  // 语音合成状态
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('female-shaonv');
  const [model, setModel] = useState('speech-2.8-hd');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [emotion, setEmotion] = useState('');
  const [languageBoost] = useState('');
  const [audioFormat] = useState('mp3');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // NOTE: 用 useRef 持久化上一次合成结果，避免 Tab 切换时丢失
  const [result, setResult] = useState<SynthesisResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [languageFilter, setLanguageFilter] = useState('全部');
  const [voiceSearch, setVoiceSearch] = useState('');

  // 克隆音色（含过期时间）
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceEntry[]>([]);

  // 保活功能状态
  const [keepAliveConfigs, setKeepAliveConfigs] = useState<KeepAliveConfig[]>([]);
  const [showKeepAliveModal, setShowKeepAliveModal] = useState<string | null>(null); // 当前操作的 voiceId
  const [keepAliveInterval, setKeepAliveInterval] = useState(5);
  const [keepingAlive, setKeepingAlive] = useState(false);

  const audioPlayer = useAudioPlayer();
  const { voices, models, emotions, loadMetadata } = useTtsApi();
  const initializedRef = useRef(false);

  // 加载音色等元数据 + 从 localStorage 恢复上一次结果、克隆音色列表和保活配置
  useEffect(() => {
    loadMetadata();
    try {
      const savedResult = scopedStorage.getItem(LS_KEY_TTS_RESULT);
      if (savedResult) setResult(JSON.parse(savedResult));
      const savedCloned = scopedStorage.getItem(LS_KEY_CLONED_VOICES);
      if (savedCloned) setClonedVoices(JSON.parse(savedCloned));
      const savedKeepAlive = scopedStorage.getItem(LS_KEY_KEEPALIVE);
      if (savedKeepAlive) setKeepAliveConfigs(JSON.parse(savedKeepAlive));
    } catch { /* ignore */ }
    requestAnimationFrame(() => { initializedRef.current = true; });
  }, [loadMetadata]);

  // 持久化克隆音色列表
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      scopedStorage.setItem(LS_KEY_CLONED_VOICES, JSON.stringify(clonedVoices));
    } catch { /* ignore */ }
  }, [clonedVoices]);

  // 持久化保活配置
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      scopedStorage.setItem(LS_KEY_KEEPALIVE, JSON.stringify(keepAliveConfigs));
    } catch { /* ignore */ }
  }, [keepAliveConfigs]);

  // NOTE: 保活定时器 — 页面打开时检查是否有需要保活的音色
  useEffect(() => {
    if (keepAliveConfigs.length === 0 || clonedVoices.length === 0) return;

    const checkKeepAlive = async () => {
      for (const cfg of keepAliveConfigs) {
        if (!cfg.enabled) continue;
        const lastKept = new Date(cfg.lastKeptAt).getTime();
        const nextKeepAt = lastKept + cfg.intervalDays * 24 * 60 * 60 * 1000;
        // 到期需要保活
        if (Date.now() >= nextKeepAt) {
          try {
            const resp = await fetch('/api/tts-synthesis/synthesize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: KEEPALIVE_TEXT, voiceId: cfg.voiceId,
                model: 'speech-2.8-hd', speed: 1.0, pitch: 0, volume: 1.0,
                emotion: '', audioFormat: 'mp3', languageBoost: '',
              }),
            });
            if (resp.ok) {
              // 更新保活时间和克隆音色的 lastUsedAt
              setKeepAliveConfigs(prev => prev.map(c =>
                c.voiceId === cfg.voiceId ? { ...c, lastKeptAt: new Date().toISOString() } : c
              ));
              setClonedVoices(prev => prev.map(v =>
                v.id === cfg.voiceId ? { ...v, lastUsedAt: new Date().toISOString() } : v
              ));
              console.info(`[KeepAlive] Voice ${cfg.voiceId} kept alive successfully`);
            }
          } catch (err) {
            console.error(`[KeepAlive] Failed for ${cfg.voiceId}:`, err);
          }
        }
      }
    };

    checkKeepAlive();
    // NOTE: 每小时检查一次是否需要保活
    const timer = setInterval(checkKeepAlive, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [keepAliveConfigs, clonedVoices.length]);

  /** 手动执行一次保活（立即续命） */
  const handleManualKeepAlive = async (targetVoiceId: string) => {
    setKeepingAlive(true);
    try {
      const resp = await fetch('/api/tts-synthesis/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: KEEPALIVE_TEXT, voiceId: targetVoiceId,
          model: 'speech-2.8-hd', speed: 1.0, pitch: 0, volume: 1.0,
          emotion: '', audioFormat: 'mp3', languageBoost: '',
        }),
      });
      if (!resp.ok) throw new Error('保活失败');
      // 刷新 lastUsedAt
      setClonedVoices(prev => prev.map(v =>
        v.id === targetVoiceId ? { ...v, lastUsedAt: new Date().toISOString() } : v
      ));
      setKeepAliveConfigs(prev => prev.map(c =>
        c.voiceId === targetVoiceId ? { ...c, lastKeptAt: new Date().toISOString() } : c
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : '保活请求失败');
    } finally {
      setKeepingAlive(false);
    }
  };

  /** 保存保活配置 */
  const handleSaveKeepAlive = (targetVoiceId: string, enabled: boolean) => {
    setKeepAliveConfigs(prev => {
      const existing = prev.find(c => c.voiceId === targetVoiceId);
      if (existing) {
        return prev.map(c => c.voiceId === targetVoiceId
          ? { ...c, intervalDays: keepAliveInterval, enabled }
          : c
        );
      }
      return [...prev, {
        voiceId: targetVoiceId,
        intervalDays: keepAliveInterval,
        enabled,
        lastKeptAt: new Date().toISOString(),
      }];
    });
    setShowKeepAliveModal(null);
  };

  /** 按语言筛选 + 搜索 过滤音色列表 */
  const filteredVoices = useMemo(() => {
    let list = voices;
    if (languageFilter !== '全部') {
      if (languageFilter === '多语种') {
        const mainLangs = ['中文', '粤语', '英文', '日文', '韩文'];
        list = list.filter(v => !mainLangs.includes(v.language));
      } else {
        list = list.filter(v => v.language === languageFilter);
      }
    }
    if (voiceSearch.trim()) {
      const q = voiceSearch.toLowerCase();
      list = list.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        v.style.toLowerCase().includes(q)
      );
    }
    return list;
  }, [voices, languageFilter, voiceSearch]);

  /** 提交语音合成 */
  const handleSynthesize = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_PER_SYNTHESIS, '语音合成')) return;
    if (!text.trim()) { setError('请输入需要合成的文本'); return; }
    if (text.length > MAX_TEXT_LENGTH) { setError(`文本长度超过限制（最大 ${MAX_TEXT_LENGTH} 字符）`); return; }

    audioPlayer.cleanup();
    setLoading(true);
    setError('');

    try {
      const resp = await fetch('/api/tts-synthesis/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(), voiceId, model, speed, pitch, volume, emotion, audioFormat, languageBoost,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || '合成失败');
      }
      const data: SynthesisResult = await resp.json();
      setResult(data);

      // NOTE: 持久化到 localStorage，下次进入页面时恢复
      try {
        scopedStorage.setItem(LS_KEY_TTS_RESULT, JSON.stringify(data));
      } catch { /* quota exceeded */ }

      // NOTE: 如果使用的是克隆音色，刷新其 lastUsedAt（续命）
      setClonedVoices(prev =>
        prev.map(v => v.id === voiceId ? { ...v, lastUsedAt: new Date().toISOString() } : v)
      );

      // NOTE: 同步写入资产库和历史记录
      const now = Date.now();
      const dateStr = new Date(now).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      const assetId = `tts-${now}-${data.traceId.slice(0, 6)}`;
      addAssetRecordWithSize({
        id: assetId,
        name: `语音合成_${voiceId}_${dateStr}.${audioFormat}`,
        source: '数字工厂-语音合成',
        type: 'audio',
        size: data.audioDuration ? `${(data.audioDuration / 1000).toFixed(1)}s` : '-',
        date: dateStr,
        // NOTE: base64 数据不适合存 URL，资产库预览时跳转到工具界面播放
        toolId: 'tts-synthesis',
      });
      addHistoryRecord({
        id: `history-tts-${now}`,
        toolName: '语音合成',
        action: `合成「${text.trim().slice(0, 20)}${text.trim().length > 20 ? '...' : ''}」使用音色 ${voiceId}`,
        status: 'success',
        time: new Date(now).toISOString(),
        duration: data.audioDuration ? `${(data.audioDuration / 1000).toFixed(1)}s` : '-',
        output: `${data.textLength} 字 · ${data.audioFormat.toUpperCase()} · 音色: ${voiceId}`,
      });

      // NOTE: 合成成功后扣除积分
      await consumeCredits(CREDIT_PER_SYNTHESIS, '语音合成');
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  /** 插入停顿标签到文本 */
  const insertPause = () => {
    setText(prev => prev + '<#0.5#>');
  };

  /** 插入语气词标签 */
  const insertMoodTag = (tag: string) => {
    setText(prev => prev + tag);
  };

  /** 克隆成功回调 */
  const handleCloneSuccess = useCallback((newVoiceId: string) => {
    setClonedVoices(prev => {
      if (prev.some(v => v.id === newVoiceId)) return prev;
      return [...prev, { id: newVoiceId, lastUsedAt: new Date().toISOString() }];
    });
    setVoiceId(newVoiceId);
    setActiveTab('synthesis');
  }, []);

  const selectedVoice = voices.find(v => v.id === voiceId);
  const is28Model = model.startsWith('speech-2.8');

  return (
    <div className="flex gap-0 h-[calc(100vh-200px)] min-h-[560px]">
      {/* ========== 左侧垂直导航 ========== */}
      <div className="w-14 shrink-0 flex flex-col items-center py-4 gap-3 bg-nexus-surface/30 border-r border-nexus-border rounded-l-2xl">
        {[
          { id: 'synthesis' as ActiveTab, icon: Volume2, label: '合成' },
          { id: 'clone' as ActiveTab, icon: Mic, label: '克隆' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`cursor-target w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
              activeTab === tab.id
                ? 'bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.15)]'
                : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface/50'
            }`}
            title={tab.label}
          >
            <tab.icon size={16} />
            <span className="text-[8px] font-bold">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ========== 右侧主内容区 ========== */}
      {/* NOTE: 移除 overflow-hidden，各面板自行控制滚动，避免产生不必要的滚动条 */}
      <div className="flex-1 min-w-0 bg-nexus-surface/20 border border-l-0 border-nexus-border rounded-r-2xl relative">
        <AnimatePresence mode="wait">
          {/* ---- 语音合成面板 ---- */}
          {activeTab === 'synthesis' && (
            <motion.div
              key="synthesis"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col lg:flex-row"
            >
              {/* 左列: 文本输入区 */}
              <div className="flex-1 flex flex-col p-5 min-w-0 border-r border-nexus-border/50">
                {/* 文本编辑器 */}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-nexus-muted">合成文本</label>
                    <span className={`text-[10px] font-mono ${text.length > MAX_TEXT_LENGTH * 0.9 ? 'text-amber-400' : 'text-nexus-muted'}`}>
                      {text.length} / {MAX_TEXT_LENGTH}
                    </span>
                  </div>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="输入需要转换为语音的文本内容，支持中文、英文等 40+ 种语言..."
                    maxLength={MAX_TEXT_LENGTH}
                    className="cursor-target flex-1 w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 focus:shadow-[0_0_10px_rgba(62,237,231,0.1)] transition-all resize-none min-h-[120px]"
                  />

                  {/* 快捷标签栏 */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button onClick={insertPause}
                      className="cursor-target text-[10px] px-2.5 py-1 rounded-lg border border-nexus-border text-nexus-muted hover:border-nexus-primary/30 hover:text-nexus-primary transition-all flex items-center gap-1">
                      <Hash size={10} /> 停顿
                    </button>
                    {is28Model && MOOD_TAGS.slice(0, 6).map(m => (
                      <button key={m.tag} onClick={() => insertMoodTag(m.tag)}
                        className="cursor-target text-[10px] px-2 py-1 rounded-lg border border-nexus-border text-nexus-muted hover:border-nexus-primary/30 hover:text-nexus-primary transition-all">
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 模型 + 情感 */}
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-nexus-muted w-10 shrink-0">模型</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {models.map(m => (
                        <button key={m.id} onClick={() => setModel(m.id)}
                          className={`cursor-target text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                            model === m.id
                              ? 'border-nexus-primary/50 bg-nexus-primary/10 text-nexus-primary'
                              : 'border-nexus-border text-nexus-muted hover:border-nexus-primary/30'
                          }`}>
                          {m.name} {m.latest && <span className="text-[8px] ml-0.5 text-amber-400">NEW</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-nexus-muted w-10 shrink-0">情感</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {emotions.map(e => (
                        <button key={e.id} onClick={() => setEmotion(e.id)}
                          className={`cursor-target text-[10px] px-2 py-1 rounded-lg border transition-all ${
                            emotion === e.id
                              ? 'border-nexus-primary/50 bg-nexus-primary/10 text-nexus-primary'
                              : 'border-nexus-border text-nexus-muted hover:border-nexus-primary/30'
                          }`}>
                          {e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 高级参数 */}
                <div className="mt-3">
                  <button onClick={() => setShowAdvanced(!showAdvanced)}
                    className="cursor-target flex items-center gap-2 text-[10px] text-nexus-muted hover:text-nexus-primary transition-colors">
                    <Settings2 size={11} /> 音色效果调节
                    <ChevronDown size={11} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden">
                        <div className="grid grid-cols-3 gap-4 mt-3 p-3 bg-nexus-bg/50 rounded-xl border border-nexus-border/50">
                          {[
                            { label: '语速', value: speed, set: (v: number) => setSpeed(v), min: 0.5, max: 2.0, step: 0.1, display: `${speed.toFixed(1)}x` },
                            { label: '音调', value: pitch, set: (v: number) => setPitch(v), min: -12, max: 12, step: 1, display: pitch > 0 ? `+${pitch}` : `${pitch}` },
                            { label: '音量', value: volume, set: (v: number) => setVolume(v), min: 0.1, max: 10.0, step: 0.1, display: volume.toFixed(1) },
                          ].map(p => (
                            <div key={p.label}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-nexus-muted">{p.label}</span>
                                <span className="text-[10px] text-nexus-primary font-mono">{p.display}</span>
                              </div>
                              <input type="range" min={p.min} max={p.max} step={p.step} value={p.value}
                                onChange={(e) => p.set(parseFloat(e.target.value))}
                                className="cursor-target w-full accent-nexus-primary h-1" />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end mt-1">
                          <button onClick={() => { setSpeed(1.0); setPitch(0); setVolume(1.0); }}
                            className="cursor-target text-[9px] text-nexus-muted hover:text-nexus-primary flex items-center gap-1">
                            <RotateCcw size={9} /> 重置
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 合成按钮 */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-nexus-border/50">
                  <button onClick={handleSynthesize} disabled={loading || !text.trim()}
                    className="cursor-target px-6 py-2.5 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                    {loading ? '合成中…' : '生成音频'}
                  </button>
                  <div className="flex items-center gap-2 text-[10px] text-amber-400/80">
                    <Zap size={10} />
                    <span>消耗 <strong>{CREDIT_PER_SYNTHESIS}</strong> 算力</span>
                  </div>
                </div>
              </div>

              {/* 右列: 音色选择 + 结果 — 内容不超出视窗，无需外层滚动 */}
              <div className="w-full lg:w-[320px] shrink-0 flex flex-col p-5">
                {/* 音色选择区 */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-nexus-muted font-mono">音色</span>
                  {selectedVoice && (
                    <span className="text-[10px] text-nexus-primary">{selectedVoice.name}</span>
                  )}
                </div>

                {/* 搜索框 */}
                <div className="relative mb-3">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-nexus-muted" />
                  <input type="text" value={voiceSearch} onChange={(e) => setVoiceSearch(e.target.value)}
                    placeholder="搜索音色..."
                    className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 transition-all" />
                </div>

                {/* 语言筛选 */}
                <div className="flex gap-1 mb-3 flex-wrap">
                  {LANGUAGE_FILTERS.map(lang => (
                    <button key={lang} onClick={() => setLanguageFilter(lang)}
                      className={`cursor-target text-[9px] px-2 py-0.5 rounded-md border transition-all ${
                        languageFilter === lang
                          ? 'border-nexus-primary/50 bg-nexus-primary/10 text-nexus-primary'
                          : 'border-nexus-border/50 text-nexus-muted hover:text-nexus-text'
                      }`}>
                      {lang}
                    </button>
                  ))}
                </div>

                {/* 克隆音色区域 — 过期倒计时可点击，支持保活 */}
                {clonedVoices.length > 0 && (
                  <div className="mb-3 p-2.5 bg-nexus-surface/40 border border-nexus-border rounded-lg">
                    <span className="text-[10px] text-nexus-secondary font-bold">克隆音色</span>
                    <div className="flex flex-col gap-1.5 mt-1.5">
                      {clonedVoices.map(cv => {
                        const isSelected = voiceId === cv.id;
                        const remainDays = daysUntilExpiry(cv.lastUsedAt);
                        const kaConfig = keepAliveConfigs.find(c => c.voiceId === cv.id);
                        const isKeepAliveOn = kaConfig?.enabled ?? false;
                        return (
                          <div key={cv.id} className="flex items-center gap-1">
                            <button onClick={() => setVoiceId(cv.id)}
                              className={`cursor-target flex-1 text-left text-[10px] px-3 py-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'border-nexus-primary bg-nexus-primary/15 text-nexus-primary shadow-[0_0_8px_rgba(62,237,231,0.2)]'
                                  : 'border-nexus-border/30 bg-nexus-bg/30 text-nexus-muted/70 hover:border-nexus-border hover:text-nexus-muted'
                              }`}>
                              <span className="flex items-center gap-1.5 truncate">
                                <Mic size={9} className="shrink-0" />{cv.id}
                              </span>
                              {/* 过期倒计时 — 可点击打开保活弹窗 */}
                              <span
                                onClick={(e) => { e.stopPropagation(); setShowKeepAliveModal(cv.id); }}
                                className={`cursor-target flex items-center gap-0.5 text-[8px] shrink-0 px-1.5 py-0.5 rounded-md border transition-all hover:bg-nexus-surface/60 ${
                                  remainDays <= 2 ? 'text-red-400 border-red-400/30 hover:border-red-400/60'
                                    : remainDays <= 4 ? 'text-amber-400 border-amber-400/30 hover:border-amber-400/60'
                                    : 'text-nexus-muted/50 border-nexus-border/30 hover:border-nexus-border'
                                }`}
                                title="点击设置保活"
                              >
                                {isKeepAliveOn && <Shield size={7} className="text-nexus-primary mr-0.5" />}
                                <Clock size={8} />{remainDays}天
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 音色列表 */}
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {filteredVoices.map(voice => (
                    <button key={voice.id} onClick={() => { setVoiceId(voice.id); audioPlayer.cleanup(); }}
                      className={`cursor-target w-full px-3 py-2 rounded-lg border text-left transition-all text-[11px] ${
                        voiceId === voice.id
                          ? 'border-nexus-primary/50 bg-nexus-primary/5 text-nexus-primary'
                          : 'border-transparent hover:bg-nexus-surface/50 text-nexus-muted hover:text-nexus-text'
                      }`}>
                      <div className="font-medium truncate">{voice.name}</div>
                      <div className="text-[9px] opacity-60 mt-0.5">{voice.gender} · {voice.style} · {voice.language}</div>
                    </button>
                  ))}
                  {filteredVoices.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-nexus-muted">无匹配音色</div>
                  )}
                </div>

                {/* 自定义 voiceId 输入 */}
                <div className="mt-3 pt-3 border-t border-nexus-border/50">
                  <label className="text-[9px] text-nexus-muted mb-1 block">自定义音色ID</label>
                  <input type="text" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}
                    className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-1.5 text-[10px] text-nexus-text font-mono outline-none focus:border-nexus-primary/50 transition-all" />
                </div>

                {/* 合成结果 — 持久化显示直到新结果覆盖 */}
                <AnimatePresence>
                  {result && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="mt-4 p-4 bg-nexus-bg/60 rounded-xl border border-nexus-border/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <Mic size={14} className="text-nexus-primary" />
                        <span className="text-xs font-bold text-nexus-text">合成完成</span>
                        <span className="text-[9px] text-nexus-muted ml-auto font-mono">{result.traceId.slice(0, 8)}</span>
                      </div>
                      <div className="text-[10px] text-nexus-muted">
                        {result.textLength} 字 · {result.audioDuration ? `${(result.audioDuration / 1000).toFixed(1)}s` : ''} · {result.audioFormat.toUpperCase()}
                      </div>

                      {/* 播放控制 */}
                      <div className="flex items-center gap-3">
                        <button onClick={() => audioPlayer.playBase64(result.audioBase64, result.audioFormat)}
                          className="cursor-target w-10 h-10 rounded-full bg-gradient-to-br from-nexus-primary to-nexus-secondary flex items-center justify-center text-nexus-inverse hover:shadow-[0_0_15px_rgba(62,237,231,0.4)] transition-all shrink-0">
                          {audioPlayer.isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                        </button>
                        {/* 波形动画 */}
                        <div className="flex-1 flex items-center gap-0.5 h-6">
                          {Array.from({ length: 24 }).map((_, i) => (
                            <motion.div key={i} className="flex-1 bg-nexus-primary/30 rounded-full min-w-[2px]"
                              animate={audioPlayer.isPlaying
                                ? { height: [3, 6 + Math.random() * 18, 3], opacity: [0.3, 0.8, 0.3] }
                                : { height: 3 + Math.sin(i * 0.5) * 4, opacity: 0.4 }}
                              transition={audioPlayer.isPlaying
                                ? { duration: 0.4 + Math.random() * 0.3, repeat: Infinity, repeatType: 'reverse', delay: i * 0.02 }
                                : { duration: 0.3 }} />
                          ))}
                        </div>
                        <button onClick={() => audioPlayer.downloadBase64(result.audioBase64, result.audioFormat)}
                          className="cursor-target w-8 h-8 rounded-lg bg-nexus-surface border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-primary transition-all shrink-0"
                          title="下载">
                          <Download size={14} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ---- 音色克隆面板 ---- */}
          {activeTab === 'clone' && (
            <motion.div key="clone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }} className="h-full p-5 overflow-y-auto">
              <VoiceClonePanel onCloneSuccess={handleCloneSuccess} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 全局错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-4 left-4 right-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-400 z-10 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="cursor-target text-red-400/60 hover:text-red-400 shrink-0 ml-2"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 保活设置弹窗 */}
        <AnimatePresence>
          {showKeepAliveModal && (() => {
            const targetVoice = clonedVoices.find(v => v.id === showKeepAliveModal);
            if (!targetVoice) return null;
            const remainDays = daysUntilExpiry(targetVoice.lastUsedAt);
            const existingConfig = keepAliveConfigs.find(c => c.voiceId === showKeepAliveModal);
            const currentOption = KEEPALIVE_OPTIONS.find(o => o.days === keepAliveInterval);
            return (
              <motion.div
                key="keepalive-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-nexus-bg/70 backdrop-blur-sm rounded-2xl"
                onClick={() => setShowKeepAliveModal(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-[380px] bg-nexus-surface border border-nexus-border rounded-2xl shadow-2xl overflow-hidden"
                >
                  {/* 头部 */}
                  <div className="px-5 pt-5 pb-3 border-b border-nexus-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield size={16} className="text-nexus-primary" />
                        <span className="text-sm font-bold text-nexus-text">音色保活设置</span>
                      </div>
                      <button onClick={() => setShowKeepAliveModal(null)}
                        className="cursor-target w-7 h-7 rounded-lg bg-nexus-bg/60 border border-nexus-border/50 flex items-center justify-center text-nexus-muted hover:text-nexus-text hover:border-nexus-border transition-all">
                        <X size={12} />
                      </button>
                    </div>
                    <p className="text-[10px] text-nexus-muted mt-1.5">
                      定期自动合成短文本，防止克隆音色因 7 天未使用而过期
                    </p>
                  </div>

                  {/* 音色信息 */}
                  <div className="px-5 py-3">
                    <div className="flex items-center justify-between p-3 bg-nexus-bg/40 rounded-xl border border-nexus-border/30">
                      <div className="flex items-center gap-2">
                        <Mic size={12} className="text-nexus-primary" />
                        <span className="text-xs font-mono text-nexus-text">{showKeepAliveModal}</span>
                      </div>
                      <span className={`text-[10px] flex items-center gap-1 ${
                        remainDays <= 2 ? 'text-red-400' : remainDays <= 4 ? 'text-amber-400' : 'text-nexus-muted'
                      }`}>
                        <Clock size={10} />剩余 {remainDays} 天
                      </span>
                    </div>

                    {/* 危险提示 */}
                    {remainDays <= 2 && (
                      <div className="flex items-start gap-2 mt-2.5 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                        <AlertTriangle size={12} className="text-red-400 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-red-400">
                          音色即将过期！建议立即续命或开启自动保活。过期后需重新克隆（¥9.9）。
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 立即续命 */}
                  <div className="px-5 pb-3">
                    <button
                      onClick={() => handleManualKeepAlive(showKeepAliveModal)}
                      disabled={keepingAlive}
                      className="cursor-target w-full h-9 rounded-xl bg-gradient-to-r from-nexus-primary/20 to-nexus-secondary/20 border border-nexus-primary/30 text-nexus-primary text-xs font-bold flex items-center justify-center gap-2 hover:border-nexus-primary/60 hover:shadow-[0_0_12px_rgba(62,237,231,0.15)] transition-all disabled:opacity-50"
                    >
                      {keepingAlive ? (
                        <><Loader2 size={12} className="animate-spin" />续命中...</>
                      ) : (
                        <><Zap size={12} />立即续命（消耗 5 算力）</>
                      )}
                    </button>
                  </div>

                  {/* 分割线 */}
                  <div className="mx-5 border-t border-nexus-border/30" />

                  {/* 自动保活设置 */}
                  <div className="px-5 py-3 space-y-3">
                    <span className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider">自动保活周期</span>
                    <div className="flex flex-col gap-1.5">
                      {KEEPALIVE_OPTIONS.map(opt => (
                        <button
                          key={opt.days}
                          onClick={() => setKeepAliveInterval(opt.days)}
                          className={`cursor-target w-full px-3 py-2.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                            keepAliveInterval === opt.days
                              ? 'border-nexus-primary/50 bg-nexus-primary/5 text-nexus-primary'
                              : 'border-nexus-border/30 bg-nexus-bg/30 text-nexus-muted hover:border-nexus-border hover:text-nexus-text'
                          }`}
                        >
                          <span className="text-xs">{opt.label}</span>
                          <span className="text-[10px] opacity-60">
                            ≈ {opt.creditPerMonth} 算力/月
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 底部操作 */}
                  <div className="px-5 pb-5 flex gap-2">
                    {existingConfig?.enabled ? (
                      <button
                        onClick={() => handleSaveKeepAlive(showKeepAliveModal, false)}
                        className="cursor-target flex-1 h-10 rounded-xl bg-nexus-bg/60 border border-red-400/30 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 hover:border-red-400/60 transition-all"
                      >
                        关闭保活
                      </button>
                    ) : null}
                    <button
                      onClick={() => handleSaveKeepAlive(showKeepAliveModal, true)}
                      className="cursor-target flex-1 h-10 rounded-xl bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse text-xs font-bold flex items-center justify-center gap-1.5 hover:shadow-[0_0_20px_rgba(62,237,231,0.3)] transition-all"
                    >
                      <Shield size={12} />
                      {existingConfig?.enabled ? '更新保活' : '开启自动保活'}
                    </button>
                  </div>

                  {/* 费用说明 */}
                  <div className="px-5 pb-4">
                    <p className="text-[9px] text-nexus-muted/50 text-center">
                      {currentOption && `选择「${currentOption.label}」每月约消耗 ${currentOption.creditPerMonth} 算力（${Math.ceil(30 / currentOption.days)} 次 × 5 算力/次）`}
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
}
