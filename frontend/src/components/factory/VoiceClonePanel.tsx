import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Mic,
  FileAudio,
  Settings2,
  Play,
  ChevronRight,
} from 'lucide-react';
import type { UploadedFile, CloneResult } from './tts-utils';
import { CLONE_SCENES } from './tts-utils';

/**
 * 音色克隆面板组件
 * NOTE: 三步引导式 UI — 上传复刻音频 → 配置参数 → 执行克隆
 * 每次克隆成本约 ¥9.9，需二次确认
 */

interface VoiceClonePanelProps {
  onCloneSuccess?: (voiceId: string) => void;
}

export default function VoiceClonePanel({ onCloneSuccess }: VoiceClonePanelProps) {
  // 步骤状态
  const [step, setStep] = useState(1);

  // Step 1: 上传复刻音频
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [uploadedCloneFile, setUploadedCloneFile] = useState<UploadedFile | null>(null);
  const [uploadingClone, setUploadingClone] = useState(false);
  const cloneFileRef = useRef<HTMLInputElement>(null);

  // Step 2: 配置参数
  const [voiceId, setVoiceId] = useState('');
  const [selectedScene, setSelectedScene] = useState('random');
  const [trialText, setTrialText] = useState(CLONE_SCENES[0].text);
  const [enableTrial, setEnableTrial] = useState(true);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [volumeNormalization, setVolumeNormalization] = useState(false);
  const [cloneModel, setCloneModel] = useState('speech-2.8-hd');

  // Step 2b: 示例音频（可选）
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [uploadedPromptFile, setUploadedPromptFile] = useState<UploadedFile | null>(null);
  const [uploadingPrompt, setUploadingPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const promptFileRef = useRef<HTMLInputElement>(null);

  // Step 3: 执行克隆
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<CloneResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  /** 上传复刻音频 */
  const handleUploadCloneFile = async (file: File) => {
    setCloneFile(file);
    setUploadingClone(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/tts-synthesis/voice-clone/upload-file', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || '上传失败');
      }
      const data: UploadedFile = await resp.json();
      setUploadedCloneFile(data);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      setCloneFile(null);
    } finally {
      setUploadingClone(false);
    }
  };

  /** 上传示例音频 */
  const handleUploadPromptFile = async (file: File) => {
    setPromptFile(file);
    setUploadingPrompt(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/tts-synthesis/voice-clone/upload-prompt', {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) throw new Error('上传失败');
      const data: UploadedFile = await resp.json();
      setUploadedPromptFile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '示例音频上传失败');
      setPromptFile(null);
    } finally {
      setUploadingPrompt(false);
    }
  };

  /** 执行克隆（需二次确认） */
  const handleClone = async () => {
    if (!uploadedCloneFile || !voiceId.trim()) return;

    setCloning(true);
    setError('');
    setShowConfirm(false);
    try {
      const body: Record<string, unknown> = {
        fileId: uploadedCloneFile.fileId,
        voiceId: voiceId.trim(),
        needNoiseReduction: noiseReduction,
        needVolumeNormalization: volumeNormalization,
      };
      if (uploadedPromptFile && promptText.trim()) {
        body.promptAudioId = uploadedPromptFile.fileId;
        body.promptText = promptText.trim();
      }
      if (enableTrial && trialText.trim()) {
        body.text = trialText.trim();
        body.model = cloneModel;
      }

      const resp = await fetch('/api/tts-synthesis/voice-clone/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || '克隆失败');
      }
      const data: CloneResult = await resp.json();
      setCloneResult(data);
      setStep(3);
      onCloneSuccess?.(voiceId.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : '克隆失败');
    } finally {
      setCloning(false);
    }
  };

  /** 重置所有状态 */
  const handleReset = () => {
    setStep(1);
    setCloneFile(null);
    setUploadedCloneFile(null);
    setVoiceId('');
    setCloneResult(null);
    setPromptFile(null);
    setUploadedPromptFile(null);
    setPromptText('');
    setError('');
  };

  const currentSceneText = CLONE_SCENES.find(s => s.id === selectedScene)?.text || '';

  return (
    <div className="h-full flex flex-col">
      {/* 步骤指示器 */}
      <div className="flex items-center gap-3 mb-6 px-1">
        {[
          { n: 1, label: '上传音频' },
          { n: 2, label: '配置参数' },
          { n: 3, label: '完成克隆' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className={`w-8 h-px ${step >= s.n ? 'bg-nexus-primary/50' : 'bg-nexus-border'}`} />}
            <div className={`flex items-center gap-2 text-xs ${
              step === s.n ? 'text-nexus-primary' : step > s.n ? 'text-nexus-secondary' : 'text-nexus-muted'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                step === s.n
                  ? 'border-nexus-primary bg-nexus-primary/10 text-nexus-primary'
                  : step > s.n
                    ? 'border-nexus-secondary bg-nexus-secondary/10 text-nexus-secondary'
                    : 'border-nexus-border text-nexus-muted'
              }`}>
                {step > s.n ? '✓' : s.n}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 步骤内容区 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        <AnimatePresence mode="wait">
          {/* Step 1: 上传复刻音频 */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <Mic size={14} className="text-nexus-primary" />
                  <span className="text-xs text-nexus-muted font-mono">STEP 1 · 上传复刻音频</span>
                </div>
                <p className="text-[11px] text-nexus-muted leading-relaxed">
                  请上传一段清晰的人声音频（10秒~5分钟），系统将从中学习音色特征进行复刻。
                  支持 mp3、m4a、wav 格式，最大 20MB。
                </p>

                <div
                  className="cursor-target border-2 border-dashed border-nexus-border rounded-xl p-8 text-center hover:border-nexus-primary/40 transition-all"
                  onClick={() => cloneFileRef.current?.click()}
                >
                  <input
                    ref={cloneFileRef}
                    type="file"
                    accept=".mp3,.m4a,.wav"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadCloneFile(f);
                    }}
                    className="hidden"
                  />
                  {uploadingClone ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={28} className="text-nexus-primary animate-spin" />
                      <span className="text-xs text-nexus-muted">正在上传并分析音频...</span>
                    </div>
                  ) : cloneFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <FileAudio size={28} className="text-nexus-primary" />
                      <span className="text-xs text-nexus-text">{cloneFile.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCloneFile(null); }}
                        className="cursor-target text-xs text-nexus-muted hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-nexus-muted">
                      <Upload size={28} />
                      <span className="text-xs">点击或拖拽上传音频文件</span>
                      <span className="text-[10px] opacity-60">mp3 / m4a / wav · 10s~5min · ≤20MB</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: 配置参数 */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {/* 已上传文件信息 */}
              <div className="flex items-center gap-3 p-3 bg-nexus-primary/5 border border-nexus-primary/20 rounded-xl">
                <CheckCircle size={16} className="text-nexus-primary shrink-0" />
                <div className="text-xs">
                  <span className="text-nexus-text font-medium">{cloneFile?.name}</span>
                  <span className="text-nexus-muted ml-2">
                    {uploadedCloneFile && `${(uploadedCloneFile.bytes / 1024 / 1024).toFixed(1)}MB`}
                  </span>
                </div>
                <button onClick={() => { setStep(1); setUploadedCloneFile(null); setCloneFile(null); }}
                  className="cursor-target ml-auto text-nexus-muted hover:text-red-400">
                  <X size={14} />
                </button>
              </div>

              {/* Voice ID 输入 */}
              <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-5 space-y-4">
                <label className="text-xs text-nexus-muted block">自定义音色 ID *</label>
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  placeholder="例如: MyVoice001 (8~256位，字母开头)"
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 transition-all font-mono"
                />
                <p className="text-[10px] text-nexus-muted">
                  首字符必须为字母，允许数字、字母、- 和 _，末位不能是 - 或 _
                </p>
              </div>

              {/* 场景选择 + 试听文本 */}
              <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-nexus-muted">试听文本</label>
                  <label className="flex items-center gap-2 cursor-target">
                    <input type="checkbox" checked={enableTrial} onChange={(e) => setEnableTrial(e.target.checked)}
                      className="accent-nexus-primary w-3 h-3" />
                    <span className="text-[10px] text-nexus-muted">生成试听</span>
                  </label>
                </div>
                {enableTrial && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {CLONE_SCENES.map(s => (
                        <button key={s.id}
                          onClick={() => { setSelectedScene(s.id); setTrialText(s.text); }}
                          className={`cursor-target text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                            selectedScene === s.id
                              ? 'border-nexus-primary/50 bg-nexus-primary/10 text-nexus-primary'
                              : 'border-nexus-border text-nexus-muted hover:border-nexus-primary/30'
                          }`}
                        >{s.label}</button>
                      ))}
                    </div>
                    <textarea
                      value={trialText}
                      onChange={(e) => setTrialText(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-xs text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 transition-all resize-none"
                    />
                    <div className="flex justify-between text-[10px] text-nexus-muted">
                      <span>{trialText.length} / 1000 字符</span>
                      <select value={cloneModel} onChange={(e) => setCloneModel(e.target.value)}
                        className="bg-nexus-bg border border-nexus-border rounded-lg px-2 py-0.5 text-[10px] text-nexus-text outline-none">
                        <option value="speech-2.8-hd">speech-2.8-hd</option>
                        <option value="speech-2.8-turbo">speech-2.8-turbo</option>
                        <option value="speech-2.6-hd">speech-2.6-hd</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              {/* 高级选项 */}
              <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Settings2 size={12} className="text-nexus-primary" />
                  <span className="text-xs text-nexus-muted">高级选项</span>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-target">
                    <input type="checkbox" checked={noiseReduction} onChange={(e) => setNoiseReduction(e.target.checked)}
                      className="accent-nexus-primary w-3 h-3" />
                    <span className="text-[11px] text-nexus-text">降噪</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-target">
                    <input type="checkbox" checked={volumeNormalization} onChange={(e) => setVolumeNormalization(e.target.checked)}
                      className="accent-nexus-primary w-3 h-3" />
                    <span className="text-[11px] text-nexus-text">音量归一化</span>
                  </label>
                </div>

                {/* 可选示例音频 */}
                <div className="mt-3 pt-3 border-t border-nexus-border/50">
                  <p className="text-[10px] text-nexus-muted mb-2">示例音频（可选，≤8秒，增强相似度）</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => promptFileRef.current?.click()}
                      className="cursor-target flex items-center gap-2 text-[10px] px-4 py-2 rounded-lg border border-nexus-border text-nexus-muted hover:border-nexus-primary/30 hover:text-nexus-primary transition-all"
                    >
                      {uploadingPrompt ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} className="shrink-0" />}
                      <span className="truncate max-w-[180px]">{promptFile ? promptFile.name : '上传示例音频'}</span>
                    </button>
                    <input ref={promptFileRef} type="file" accept=".mp3,.m4a,.wav" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadPromptFile(f); }} />
                    {promptFile && (
                      <button onClick={() => { setPromptFile(null); setUploadedPromptFile(null); }}
                        className="text-nexus-muted hover:text-red-400"><X size={12} /></button>
                    )}
                  </div>
                  {uploadedPromptFile && (
                    <input type="text" value={promptText} onChange={(e) => setPromptText(e.target.value)}
                      placeholder="输入示例音频中说的文字内容"
                      className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg px-3 py-2 text-[11px] text-nexus-text placeholder-nexus-muted/50 outline-none focus:border-nexus-primary/50 mt-2" />
                  )}
                </div>
              </div>

              {/* 执行克隆按钮 */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs text-amber-400/80">
                  <AlertTriangle size={12} />
                  <span>本次克隆将消耗 <strong>¥9.9</strong></span>
                </div>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={cloning || !voiceId.trim() || voiceId.length < 8}
                  className="cursor-target px-6 py-2.5 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {cloning ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                  {cloning ? '克隆中...' : '开始克隆'}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: 克隆完成 */}
          {step === 3 && cloneResult && (
            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="bg-nexus-surface/50 border border-nexus-primary/20 rounded-2xl p-6 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
                  <CheckCircle size={32} className="text-nexus-primary" />
                </div>
                <h3 className="text-lg font-bold text-nexus-text">音色克隆成功！</h3>
                <p className="text-xs text-nexus-muted">{cloneResult.message}</p>
                <div className="p-3 bg-nexus-bg/50 rounded-xl">
                  <span className="text-[10px] text-nexus-muted">音色 ID</span>
                  <p className="text-sm font-mono text-nexus-primary mt-1">{cloneResult.voiceId}</p>
                </div>
                {cloneResult.demoAudioUrl && (
                  <div className="flex items-center justify-center gap-2">
                    <a href={cloneResult.demoAudioUrl} target="_blank" rel="noreferrer"
                      className="cursor-target text-xs text-nexus-primary flex items-center gap-1 hover:underline">
                      <Play size={12} /> 播放试听
                    </a>
                  </div>
                )}
                <div className="flex justify-center gap-3 pt-2">
                  <button onClick={handleReset}
                    className="cursor-target px-4 py-2 text-xs border border-nexus-border rounded-xl text-nexus-muted hover:text-nexus-text transition-all">
                    继续克隆
                  </button>
                  <button onClick={() => onCloneSuccess?.(cloneResult.voiceId)}
                    className="cursor-target px-4 py-2 text-xs bg-nexus-primary/10 border border-nexus-primary/30 rounded-xl text-nexus-primary hover:bg-nexus-primary/20 transition-all flex items-center gap-1">
                    去合成 <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-400 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 费用确认弹窗 */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={24} className="text-amber-400" />
                <h3 className="text-sm font-bold text-nexus-text">确认执行音色克隆？</h3>
              </div>
              <p className="text-xs text-nexus-muted leading-relaxed">
                音色克隆将消耗 <strong className="text-amber-400">¥9.9</strong>。
                克隆得到的音色若 7 天内未使用将自动删除。确认继续？
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowConfirm(false)}
                  className="cursor-target px-4 py-2 text-xs border border-nexus-border rounded-xl text-nexus-muted hover:text-nexus-text transition-all">
                  取消
                </button>
                <button onClick={handleClone}
                  className="cursor-target px-4 py-2 text-xs bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.4)] transition-all">
                  确认克隆
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
