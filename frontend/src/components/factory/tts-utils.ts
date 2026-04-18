import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * TTS 相关类型定义和自定义 Hook
 * NOTE: 从 TtsSynthesisTool 中抽离，保持主组件简洁
 */

// ==================== 类型定义 ====================

export interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  style: string;
  language: string;
  category: string;
}

export interface SynthesisResult {
  audioBase64: string;
  audioFormat: string;
  textLength: number;
  audioDuration: number;
  creditCost: number;
  traceId: string;
}

export interface UploadedFile {
  fileId: number;
  filename: string;
  bytes: number;
  createdAt: number;
}

export interface CloneResult {
  success: boolean;
  voiceId: string;
  demoAudioUrl: string;
  message: string;
}

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  languages: number;
  latest: boolean;
}

export interface EmotionOption {
  id: string;
  name: string;
  description: string;
}

// ==================== 常量 ====================

export const MAX_TEXT_LENGTH = 10000;
export const CREDIT_PER_SYNTHESIS = 1;

/** 语气词标签 — 仅 speech-2.8 支持 */
export const MOOD_TAGS = [
  { tag: '(laughs)', label: '笑声' },
  { tag: '(chuckle)', label: '轻笑' },
  { tag: '(sighs)', label: '叹气' },
  { tag: '(breath)', label: '换气' },
  { tag: '(coughs)', label: '咳嗽' },
  { tag: '(humming)', label: '哼唱' },
  { tag: '(emm)', label: '嗯' },
  { tag: '(gasps)', label: '倒吸气' },
  { tag: '(crying)', label: '抽泣' },
  { tag: '(applause)', label: '鼓掌' },
];

/** 音色克隆场景 */
export const CLONE_SCENES = [
  { id: 'random', label: '随机', text: '散步到了公园门口，里面的灯还亮着。走进去转了一圈，夜里的公园和白天不一样，安静了很多。有几个人在跑步，还有人坐在长椅上看手机。走了一圈出来，觉得心里平静了不少。' },
  { id: 'audiobook', label: '有声读物', text: '在那个遥远的年代，有一位年轻的旅者踏上了未知的征途。他穿过茂密的森林，翻越巍峨的山脉，只为寻找传说中的真理之泉。' },
  { id: 'movie', label: '影视配音', text: '你以为这就结束了吗？不，这只是开始。当黎明的光芒穿透黑暗，我们终将看到希望的彼岸。' },
  { id: 'vlog', label: 'Vlog独白', text: '嗨大家好，今天我来到了一个超级棒的地方。你们看这个风景，是不是特别美？我真的太喜欢这里了！' },
  { id: 'education', label: '教育培训', text: '同学们，今天我们来学习一个非常重要的概念。请大家打开课本第52页，我们从基础开始讲起。' },
  { id: 'podcast', label: '电台播客', text: '欢迎收听本期节目。今天我们邀请到了一位特别的嘉宾，让我们一起来聊聊关于未来科技发展的话题。' },
  { id: 'service', label: '智能客服', text: '您好，很高兴为您提供配音服务。选择您感兴趣的音色，让我们一起开启声音创作的奇幻之旅吧。' },
];

// ==================== 自定义 Hook ====================

/**
 * NOTE: 使用模块级变量追踪全局 Audio 实例
 * 解决 SPA 路由切换后组件重新挂载时旧 Audio 仍在后台播放的问题。
 * 模块级变量不会因组件卸载/重新挂载而丢失引用。
 */
let globalAudio: HTMLAudioElement | null = null;
let globalAudioUrl: string | null = null;

/** 音频播放控制 Hook */
export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    // 清理组件级引用
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    // 同步清理全局引用（防止后台残留）
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.onended = null;
      globalAudio = null;
    }
    if (globalAudioUrl) {
      URL.revokeObjectURL(globalAudioUrl);
      globalAudioUrl = null;
    }
    setIsPlaying(false);
  }, []);

  // NOTE: 组件挂载时先清理可能残留的全局音频（解决重新进入页面双重播放）
  // 组件卸载时也停止播放（解决退出页面后台继续播放）
  useEffect(() => {
    // 挂载：如果上一次离开页面时有音频在播放，先停掉
    if (globalAudio) {
      globalAudio.pause();
      globalAudio.onended = null;
      globalAudio = null;
    }
    if (globalAudioUrl) {
      URL.revokeObjectURL(globalAudioUrl);
      globalAudioUrl = null;
    }

    // 卸载：离开页面时清理所有音频
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      // 同时清理全局引用
      if (globalAudio) {
        globalAudio.pause();
        globalAudio.onended = null;
        globalAudio = null;
      }
      if (globalAudioUrl) {
        URL.revokeObjectURL(globalAudioUrl);
        globalAudioUrl = null;
      }
    };
  }, []);

  const playBase64 = useCallback((base64: string, format: string) => {
    // 如果正在播放，暂停
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // 创建新 Audio 前，先清理可能残留的旧实例（防止双重播放）
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: `audio/${format}` });
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audio.onended = () => setIsPlaying(false);
    audioRef.current = audio;

    // 同步到全局引用
    globalAudio = audio;
    globalAudioUrl = url;

    audio.play();
    setIsPlaying(true);
  }, [isPlaying]);

  const downloadBase64 = useCallback((base64: string, format: string) => {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: `audio/${format}` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tts_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return { isPlaying, cleanup, playBase64, downloadBase64 };
}

/** TTS API 调用 Hook */
export function useTtsApi() {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [emotions, setEmotions] = useState<EmotionOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadMetadata = useCallback(async () => {
    if (loaded) return;
    try {
      const [vRes, mRes, eRes] = await Promise.all([
        fetch('/api/tts-synthesis/voices'),
        fetch('/api/tts-synthesis/models'),
        fetch('/api/tts-synthesis/emotions'),
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        setVoices(vData.voices || []);
      }
      if (mRes.ok) {
        const mData = await mRes.json();
        setModels(mData.models || []);
      }
      if (eRes.ok) {
        const eData = await eRes.json();
        setEmotions(eData.emotions || []);
      }
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load TTS metadata:', err);
    }
  }, [loaded]);

  return { voices, models, emotions, loaded, loadMetadata };
}
