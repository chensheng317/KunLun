import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ImagePlus,
  Zap,
  Loader2,
  Upload,
  X,
  Download,
  Settings2,
  Sparkles,
  ShoppingBag,
  User,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Type,
  Maximize,
  Hash,
  Lock,
} from 'lucide-react';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage, getUserScopedKey } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';

/**
 * 图片生成工具组件
 * NOTE: 双 Tab 布局 —
 *   Tab 1: 基础图片生成（Nano Banana API，暂未开放）
 *   Tab 2: 快捷应用（RunningHub API）
 *     - 左面板：一键商品图（上传商品图 → AI 生成商品主图，RunningHub API）
 *     - 右面板：一键模特图（图片生成，RunningHub API，输入提示词）
 *
 * 设计决策：
 *  - 提交后立即将 taskId 持久化到 localStorage（参考 /async-task-persist-on-navigate）
 *  - 组件挂载时从 localStorage 恢复进行中/已完成的任务
 *  - 商品图和模特图使用独立的 pollRef，不互相打断
 *  - SUCCESS 回调中同步写入资产库和历史记录
 */

// ==================== 常量 ====================

const CREDIT_PER_IMAGE = 1;
const POLL_INTERVAL = 5000;
const LS_KEY_PRODUCT_TASK = 'kunlun_image_gen_product_task';
const LS_KEY_MODEL_TASK = 'kunlun_image_gen_model_task';

/** 基础生成参数常量 */
const MODELS = [
  { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', desc: '最佳性价比' },
  { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', desc: '专业级 4K' },
  { id: 'gemini-2.5-flash-image', name: 'Nano Banana', desc: '高速低延迟' },
];

const QUALITIES = [
  { id: 'standard', name: '标准', size: '1K' },
  { id: 'hd', name: '高清', size: '2K' },
  { id: 'ultra_hd', name: '超高清', size: '4K' },
];

const ASPECTS = [
  { id: '1:1', name: '1:1 方图' },
  { id: '3:4', name: '3:4 竖版' },
  { id: '4:3', name: '4:3 横版' },
  { id: '16:9', name: '16:9 宽屏' },
  { id: '9:16', name: '9:16 竖屏' },
];

/** 一键模特图比例选项（经验证：1=1:1, 2=3:4, 3=4:3, 4=9:16, 5=16:9） */
const MODEL_RATIO_OPTIONS = [
  { value: '1', label: '1:1', desc: '方形' },
  { value: '2', label: '3:4', desc: '竖版' },
  { value: '3', label: '4:3', desc: '横版' },
  { value: '4', label: '9:16', desc: '竖屏' },
  { value: '5', label: '16:9', desc: '横屏' },
];

// ==================== 类型 ====================

interface PersistedTask {
  taskId: string;
  status: 'uploading' | 'processing' | 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  resultUrl?: string;
  /** 模特图可能返回多张结果 */
  results?: Array<{ url: string; outputType: string }>;
  errorMessage?: string;
  timestamp: number;
}

// ==================== 工具函数 ====================

function loadPersistedTask(key: string): PersistedTask | null {
  try {
    const raw = localStorage.getItem(getUserScopedKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePersistedTask(key: string, task: PersistedTask): void {
  try {
    localStorage.setItem(getUserScopedKey(key), JSON.stringify(task));
  } catch {
    // quota exceeded 等极端情况静默忽略
  }
}

// ==================== 主组件 ====================

export default function ImageGeneratorTool() {
  // ========== Tab 控制 ==========
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  const [activeTab, setActiveTab] = useState<'basic' | 'quick'>('quick');

  // ========== 基础生成参数（保留但暂不可用） ==========
  const [model, setModel] = useState(MODELS[0].id);
  const [quality, setQuality] = useState('hd');
  const [count, setCount] = useState(1);
  const [aspect, setAspect] = useState('1:1');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');

  // ========== 一键商品图状态 ==========
  const [productFile, setProductFile] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState('');
  const [productTask, setProductTask] = useState<PersistedTask | null>(() => loadPersistedTask(LS_KEY_PRODUCT_TASK));
  const [productLoading, setProductLoading] = useState(false);
  const [productDragOver, setProductDragOver] = useState(false);

  // ========== 一键模特图状态 ==========
  const [modelPrompt, setModelPrompt] = useState('');
  const [modelRatio, setModelRatio] = useState('4');
  const [modelCount, setModelCount] = useState('1');
  const [modelTask, setModelTask] = useState<PersistedTask | null>(() => loadPersistedTask(LS_KEY_MODEL_TASK));
  const [modelLoading, setModelLoading] = useState(false);

  // ========== 通用 ==========
  const [error, setError] = useState('');
  const productInputRef = useRef<HTMLInputElement>(null);
  const productPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // NOTE: 防止 setInterval 异步竞态导致 completed 分支重入（重复扣费）
  const completedRef = useRef<{ product: boolean; model: boolean }>({ product: false, model: false });

  // ========== 轮询清理 ==========
  useEffect(() => {
    return () => {
      if (productPollRef.current) clearInterval(productPollRef.current);
      if (modelPollRef.current) clearInterval(modelPollRef.current);
    };
  }, []);

  // ========== 通用轮询函数 ==========
  const pollTaskStatus = useCallback((taskId: string, type: 'product' | 'model') => {
    const setTask = type === 'product' ? setProductTask : setModelTask;
    const setLoading = type === 'product' ? setProductLoading : setModelLoading;
    const lsKey = type === 'product' ? LS_KEY_PRODUCT_TASK : LS_KEY_MODEL_TASK;
    const timerRef = type === 'product' ? productPollRef : modelPollRef;

    if (timerRef.current) clearInterval(timerRef.current);
    // NOTE: 重置完成标记，允许新的轮询正常执行
    completedRef.current[type] = false;
    setLoading(true);

    timerRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`/api/image-gen/task/${taskId}`);
        if (!resp.ok) return;
        const data = await resp.json();

        const updatedTask: PersistedTask = {
          taskId,
          status: data.status,
          resultUrl: data.resultUrl,
          results: data.results,
          errorMessage: data.errorMessage,
          timestamp: Date.now(),
        };

        setTask(updatedTask);
        savePersistedTask(lsKey, updatedTask);

        if (data.status === 'SUCCESS' || data.status === 'FAILED') {
          // GUARD: 防止异步竞态重入，避免 consumeCredits 被调用两次
          if (completedRef.current[type]) return;
          completedRef.current[type] = true;
          if (timerRef.current) clearInterval(timerRef.current);
          setLoading(false);

          // NOTE: 成功时同步写入资产库和历史记录
          if (data.status === 'SUCCESS') {
            const now = Date.now();
            const dateStr = new Date(now).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });

            const toolLabel = type === 'product' ? '一键商品图' : '一键模特图';
            const resultUrls: string[] = data.results
              ? data.results.map((r: { url: string }) => r.url).filter(Boolean)
              : data.resultUrl ? [data.resultUrl] : [];

            // 每张结果图都写入资产库
            resultUrls.forEach((url: string, idx: number) => {
              addAssetRecordWithSize({
                id: `asset-img-gen-${taskId}-${idx}`,
                name: `${toolLabel}_${taskId.slice(0, 8)}_${idx + 1}.png`,
                source: `数字工厂-图片生成`,
                type: 'image',
                downloadUrl: url,
                size: '-',
                date: dateStr,
                toolId: 'image-gen',
              });
            });

            addHistoryRecord({
              id: `history-img-gen-${taskId}`,
              toolName: '图片生成',
              action: toolLabel,
              status: 'success',
              time: new Date(now).toISOString(),
              duration: '-',
              output: `已生成 ${resultUrls.length} 张${toolLabel}结果，已保存至资产库。`,
            });

            // NOTE: 成功后扣除积分 — 按实际生成张数计算
            await consumeCredits(resultUrls.length * CREDIT_PER_IMAGE, `图片生成-${toolLabel}`);
          }

          // 失败时清理 localStorage
          if (data.status === 'FAILED') {
            scopedStorage.removeItem(lsKey);
          }
        }
      } catch {
        /* ignore polling errors, will retry */
      }
    }, POLL_INTERVAL);
  }, []);

  // ========== 组件挂载时恢复进行中的任务 ==========
  useEffect(() => {
    const savedProduct = loadPersistedTask(LS_KEY_PRODUCT_TASK);
    if (savedProduct?.taskId && savedProduct.status !== 'SUCCESS' && savedProduct.status !== 'FAILED') {
      setProductTask(savedProduct);
      pollTaskStatus(savedProduct.taskId, 'product');
    }

    const savedModel = loadPersistedTask(LS_KEY_MODEL_TASK);
    if (savedModel?.taskId && savedModel.status !== 'SUCCESS' && savedModel.status !== 'FAILED') {
      setModelTask(savedModel);
      pollTaskStatus(savedModel.taskId, 'model');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== 商品图文件处理 ==========
  const processProductFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件（JPG、PNG、WebP）');
      return;
    }
    setProductFile(file);
    setError('');
    const reader = new FileReader();
    reader.onload = () => setProductPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleProductDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setProductDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processProductFile(file);
  }, [processProductFile]);

  const handleProductSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processProductFile(file);
  };

  // ========== 提交一键商品图 ==========
  const handleProductSubmit = async () => {
    // NOTE: 积分前置检查 — 余额不足时拦截并引导充值
    if (!checkCredits(CREDIT_PER_IMAGE, '商品图生成')) return;
    if (!productFile) { setError('请先上传商品图片'); return; }
    if (productLoading) { setError('请等待当前任务完成'); return; }
    setProductLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', productFile);

      const resp = await fetch('/api/image-gen/product/submit', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.detail || '提交失败');
      }

      const data = await resp.json();
      const task: PersistedTask = {
        taskId: data.taskId,
        status: 'processing',
        timestamp: Date.now(),
      };
      setProductTask(task);
      // NOTE: 提交后立即持久化 taskId，确保导航离开不丢失
      savePersistedTask(LS_KEY_PRODUCT_TASK, task);
      pollTaskStatus(data.taskId, 'product');
    } catch (err) {
      setError(err instanceof Error ? err.message : '一键商品图提交失败');
      setProductLoading(false);
    }
  };

  // ========== 提交一键模特图 ==========
  const handleModelSubmit = async () => {
    // NOTE: 积分前置检查
    if (!checkCredits(CREDIT_PER_IMAGE, '模特图生成')) return;
    if (!modelPrompt.trim()) { setError('请输入文本提示词'); return; }
    if (modelLoading) { setError('请等待当前任务完成'); return; }
    setModelLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('prompt', modelPrompt.trim());
      formData.append('ratio', modelRatio);
      formData.append('count', modelCount);

      const resp = await fetch('/api/image-gen/model/submit', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.detail || '提交失败');
      }

      const data = await resp.json();
      const task: PersistedTask = {
        taskId: data.taskId,
        status: 'processing',
        timestamp: Date.now(),
      };
      setModelTask(task);
      // NOTE: 提交后立即持久化 taskId
      savePersistedTask(LS_KEY_MODEL_TASK, task);
      pollTaskStatus(data.taskId, 'model');
    } catch (err) {
      setError(err instanceof Error ? err.message : '一键模特图提交失败');
      setModelLoading(false);
    }
  };

  // ========== 重置 ==========
  const handleProductReset = () => {
    if (productPollRef.current) clearInterval(productPollRef.current);
    setProductTask(null);
    setProductFile(null);
    setProductPreview('');
    setProductLoading(false);
    scopedStorage.removeItem(LS_KEY_PRODUCT_TASK);
  };

  const handleModelReset = () => {
    if (modelPollRef.current) clearInterval(modelPollRef.current);
    setModelTask(null);
    setModelLoading(false);
    scopedStorage.removeItem(LS_KEY_MODEL_TASK);
  };

  // ========== 状态判断 ==========
  const productCompleted = productTask?.status === 'SUCCESS';
  const modelCompleted = modelTask?.status === 'SUCCESS';
  const productFailed = productTask?.status === 'FAILED';
  const modelFailed = modelTask?.status === 'FAILED';

  return (
    <div className="space-y-5">
      {/* ═══ Tab 切换 ═══ */}
      <div className="flex items-center gap-2 p-1 bg-nexus-surface/60 border border-nexus-border rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('quick')}
          className={`cursor-target flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'quick'
              ? 'bg-gradient-to-r from-nexus-primary/20 to-nexus-secondary/15 text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.15)]'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}
        >
          <Sparkles size={14} />
          快捷应用
        </button>
        <button
          onClick={() => setActiveTab('basic')}
          className={`cursor-target flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'basic'
              ? 'bg-gradient-to-r from-nexus-primary/20 to-nexus-secondary/15 text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.15)]'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}
        >
          <Settings2 size={14} />
          基础图片生成
          <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-md border border-amber-500/20">
            即将开放
          </span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════════════════════════════════════════════════════
             Tab 2: 快捷应用（一键商品图 + 一键模特图）
           ═══════════════════════════════════════════════════════ */}
        {activeTab === 'quick' && (
          <motion.div
            key="quick-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex gap-5"
            style={{ minHeight: 'calc(100vh - 320px)' }}
          >
            {/* ─── 左面板：一键商品图 ─── */}
            <div className="flex-1 flex flex-col bg-nexus-surface/20 border border-nexus-border rounded-2xl overflow-hidden">
              {/* 标题栏 */}
              <div className="px-5 py-4 border-b border-nexus-border/50 flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nexus-primary/20 to-nexus-secondary/10 border border-nexus-primary/20 flex items-center justify-center">
                  <ShoppingBag size={16} className="text-nexus-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-nexus-text">一键商品图</h3>
                  <p className="text-[10px] text-nexus-muted">上传商品图片 → AI 自动生成高质量商品主图</p>
                </div>
                <div className="ml-auto flex items-center gap-1 text-[10px] text-amber-400/80">
                  <Zap size={10} />
                  <span>{CREDIT_PER_IMAGE} 算力/张</span>
                </div>
              </div>

              {/* 可滚动内容区 */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                <div className="p-5 flex flex-col gap-4">
                  {/* 上传区域 — 没有文件且没有已完成/处理中的任务 */}
                  {!productFile && !productCompleted && !productLoading && !productFailed && (
                    <label
                      htmlFor="product-upload-input"
                      className={`cursor-target min-h-[280px] flex flex-col items-center justify-center bg-nexus-bg/30 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
                        productDragOver
                          ? 'border-nexus-primary/60 bg-nexus-primary/[0.05]'
                          : 'border-nexus-border/40 hover:border-nexus-primary/40 hover:bg-nexus-primary/[0.02]'
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setProductDragOver(true); }}
                      onDragLeave={() => setProductDragOver(false)}
                      onDrop={handleProductDrop}
                    >
                      <input
                        id="product-upload-input"
                        ref={productInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleProductSelect}
                        className="absolute w-0 h-0 opacity-0 overflow-hidden"
                      />
                      <div className="w-14 h-14 rounded-2xl bg-nexus-surface/50 border border-nexus-border/40 flex items-center justify-center mb-3">
                        <Upload size={22} className="text-nexus-muted/50" />
                      </div>
                      <p className="text-xs text-nexus-muted">
                        拖放或 <span className="text-nexus-primary font-medium">点击上传</span> 商品图片
                      </p>
                      <p className="text-[10px] text-nexus-muted/40 mt-1">支持 JPG、PNG、WebP 格式</p>
                    </label>
                  )}

                  {/* 已上传文件 — 预览 + 提交按钮 */}
                  {productFile && !productCompleted && !productLoading && (
                    <>
                      <div className="relative rounded-xl overflow-hidden border border-nexus-border/30 bg-nexus-bg/30">
                        {productPreview && (
                          <img src={productPreview} alt="商品预览" className="w-full max-h-[260px] object-contain" />
                        )}
                        <button
                          onClick={() => { setProductFile(null); setProductPreview(''); }}
                          className="cursor-target absolute top-2 right-2 w-7 h-7 rounded-lg bg-nexus-bg/80 border border-nexus-border/50 flex items-center justify-center text-nexus-muted hover:text-red-400 hover:border-red-400/30 transition-all"
                        >
                          <X size={12} />
                        </button>
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-nexus-bg/80 border border-nexus-border/30 rounded-md text-[9px] text-nexus-muted font-mono truncate max-w-[200px]">
                          {productFile.name}
                        </div>
                      </div>

                      <button
                        onClick={handleProductSubmit}
                        disabled={productLoading}
                        className="cursor-target w-full h-12 bg-gradient-to-r from-nexus-primary to-nexus-secondary text-nexus-inverse font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(62,237,231,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                      >
                        <ImagePlus size={16} />
                        一键生成商品主图
                      </button>
                    </>
                  )}

                  {/* 处理中进度 */}
                  {productLoading && (
                    <TaskProgressIndicator
                      label="商品图生成中"
                      taskId={productTask?.taskId || ''}
                      status={productTask?.status || 'processing'}
                    />
                  )}

                  {/* 成功结果 */}
                  {productCompleted && productTask?.resultUrl && (
                    <TaskResultDisplay
                      type="product"
                      taskId={productTask.taskId}
                      resultUrls={
                        productTask.results
                          ? productTask.results.map(r => r.url)
                          : [productTask.resultUrl]
                      }
                      onReset={handleProductReset}
                    />
                  )}

                  {/* 失败状态 */}
                  {productFailed && (
                    <TaskFailedDisplay
                      message={productTask?.errorMessage}
                      onRetry={handleProductReset}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ─── 右面板：一键模特图 ─── */}
            <div className="flex-1 flex flex-col bg-nexus-surface/20 border border-nexus-border rounded-2xl overflow-hidden">
              {/* 标题栏 */}
              <div className="px-5 py-4 border-b border-nexus-border/50 flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#A78BFA]/20 to-[#7C3AED]/10 border border-[#A78BFA]/20 flex items-center justify-center">
                  <User size={16} className="text-[#A78BFA]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-nexus-text">一键模特图</h3>
                  <p className="text-[10px] text-nexus-muted">输入提示词 → AI 自动生成高质量模特图</p>
                </div>
                <div className="ml-auto flex items-center gap-1 text-[10px] text-amber-400/80">
                  <Zap size={10} />
                  <span>{CREDIT_PER_IMAGE} 算力/张</span>
                </div>
              </div>

              {/* 可滚动内容区 */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                <div className="p-5 flex flex-col gap-4">
                  {/* 输入区域 — 没有处理中/已完成的任务 */}
                  {!modelCompleted && !modelLoading && !modelFailed && (
                    <>
                      {/* 提示词输入 */}
                      <div>
                        <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <Type size={10} />
                          文本提示词 *
                        </label>
                        <textarea
                          value={modelPrompt}
                          onChange={(e) => setModelPrompt(e.target.value)}
                          placeholder={"描述你想要的模特形象...\n例如：穿着时尚连衣裙的年轻女性，在城市街拍场景中..."}
                          rows={5}
                          className="cursor-target w-full bg-nexus-bg/40 border border-nexus-border/50 rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/30 focus:border-[#A78BFA]/50 focus:shadow-[0_0_10px_rgba(167,139,250,0.1)] focus:outline-none resize-none transition-all"
                        />
                      </div>

                      {/* 参数：比例 + 张数 */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* 比例 */}
                        <div>
                          <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                            <Maximize size={10} />
                            图片比例
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {MODEL_RATIO_OPTIONS.map((r) => (
                              <button
                                key={r.value}
                                onClick={() => setModelRatio(r.value)}
                                className={`cursor-target px-2.5 py-2 rounded-lg text-center transition-all ${
                                  modelRatio === r.value
                                    ? 'bg-[#A78BFA] text-nexus-inverse'
                                    : 'bg-nexus-bg/30 text-nexus-muted border border-nexus-border/30 hover:text-nexus-text hover:border-nexus-muted/50'
                                }`}
                              >
                                <div className="text-xs font-bold">{r.label}</div>
                                <div className={`text-[9px] ${modelRatio === r.value ? 'text-nexus-inverse/60' : 'text-nexus-muted/60'}`}>
                                  {r.desc}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 张数 */}
                        <div>
                          <label className="text-[10px] text-nexus-muted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                            <Hash size={10} />
                            生成张数
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {['1', '2', '3', '4'].map((n) => (
                              <button
                                key={n}
                                onClick={() => setModelCount(n)}
                                className={`cursor-target px-2.5 py-2.5 rounded-lg text-center transition-all ${
                                  modelCount === n
                                    ? 'bg-[#A78BFA] text-nexus-inverse'
                                    : 'bg-nexus-bg/30 text-nexus-muted border border-nexus-border/30 hover:text-nexus-text hover:border-nexus-muted/50'
                                }`}
                              >
                                <div className="text-xs font-bold">{n} 张</div>
                                <div className={`text-[9px] ${modelCount === n ? 'text-nexus-inverse/60' : 'text-nexus-muted/60'}`}>
                                  {parseInt(n) * CREDIT_PER_IMAGE} 算力
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 提交按钮 */}
                      <button
                        onClick={handleModelSubmit}
                        disabled={!modelPrompt.trim() || modelLoading}
                        className="cursor-target w-full h-12 bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] text-white font-bold text-sm rounded-xl hover:shadow-[0_0_20px_rgba(167,139,250,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                      >
                        <User size={16} />
                        一键生成模特图
                      </button>
                    </>
                  )}

                  {/* 处理中进度 */}
                  {modelLoading && (
                    <TaskProgressIndicator
                      label="模特图生成中"
                      taskId={modelTask?.taskId || ''}
                      status={modelTask?.status || 'processing'}
                      accentColor="#A78BFA"
                    />
                  )}

                  {/* 成功结果 */}
                  {modelCompleted && (
                    <TaskResultDisplay
                      type="model"
                      taskId={modelTask!.taskId}
                      resultUrls={
                        modelTask!.results
                          ? modelTask!.results.map(r => r.url)
                          : modelTask!.resultUrl ? [modelTask!.resultUrl] : []
                      }
                      onReset={handleModelReset}
                      accentColor="#A78BFA"
                    />
                  )}

                  {/* 失败状态 */}
                  {modelFailed && (
                    <TaskFailedDisplay
                      message={modelTask?.errorMessage}
                      onRetry={handleModelReset}
                    />
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════
             Tab 1: 基础图片生成（暂未开放）
           ═══════════════════════════════════════════════════════ */}
        {activeTab === 'basic' && (
          <motion.div
            key="basic-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5 relative"
          >
            {/* 覆盖层 — 即将开放提示 */}
            <div className="absolute inset-0 z-20 bg-nexus-bg/60 backdrop-blur-[2px] rounded-2xl flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-nexus-surface border border-nexus-border flex items-center justify-center mx-auto">
                  <Lock size={28} className="text-nexus-muted/50" />
                </div>
                <h3 className="text-sm font-bold text-nexus-text">基础图片生成 · 即将开放</h3>
                <p className="text-[11px] text-nexus-muted max-w-xs leading-relaxed">
                  接入 Nano Banana 2 / Pro 生图模型，支持多种清晰度、画幅比例和参考图<br/>
                  需绑定付费账户后启用
                </p>
                <button
                  onClick={() => setActiveTab('quick')}
                  className="cursor-target text-xs text-nexus-primary hover:text-nexus-primary/80 font-medium"
                >
                  ← 使用快捷应用
                </button>
              </div>
            </div>

            {/* 参数配置区（置灰显示） */}
            <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-6 space-y-5 opacity-40 pointer-events-none">
              <div className="flex items-center gap-2 mb-1">
                <Settings2 size={14} className="text-nexus-primary" />
                <span className="text-xs text-nexus-muted font-mono uppercase">生成参数配置</span>
              </div>

              {/* 模型选择 */}
              <div>
                <label className="text-xs text-nexus-muted mb-2 block">生图模型</label>
                <div className="grid grid-cols-3 gap-2">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      className={`p-3 rounded-xl border text-left text-xs ${
                        model === m.id
                          ? 'border-nexus-primary/50 bg-nexus-primary/5 text-nexus-primary'
                          : 'border-nexus-border bg-nexus-bg text-nexus-muted'
                      }`}
                    >
                      <p className="font-bold">{m.name}</p>
                      <p className="text-[10px] mt-0.5 opacity-60">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 清晰度 + 张数 + 画幅 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-nexus-muted mb-2 block">清晰度</label>
                  <div className="space-y-1.5">
                    {QUALITIES.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => setQuality(q.id)}
                        className={`w-full p-2 rounded-lg border text-xs text-left ${
                          quality === q.id
                            ? 'border-nexus-primary/50 bg-nexus-primary/5 text-nexus-primary'
                            : 'border-nexus-border bg-nexus-bg text-nexus-muted'
                        }`}
                      >
                        {q.name} <span className="opacity-50">({q.size})</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-nexus-muted mb-2 block">生成张数</label>
                  <div className="space-y-1.5">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCount(n)}
                        className={`w-full p-2 rounded-lg border text-xs ${
                          count === n
                            ? 'border-nexus-primary/50 bg-nexus-primary/5 text-nexus-primary'
                            : 'border-nexus-border bg-nexus-bg text-nexus-muted'
                        }`}
                      >
                        {n} 张
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-nexus-muted mb-2 block">画幅比例</label>
                  <div className="space-y-1.5">
                    {ASPECTS.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAspect(a.id)}
                        className={`w-full p-2 rounded-lg border text-xs text-left ${
                          aspect === a.id
                            ? 'border-nexus-primary/50 bg-nexus-primary/5 text-nexus-primary'
                            : 'border-nexus-border bg-nexus-bg text-nexus-muted'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 提示词区域（置灰显示） */}
            <div className="bg-nexus-surface/50 border border-nexus-border rounded-2xl p-4 space-y-4 opacity-40 pointer-events-none">
              <div>
                <label className="text-xs text-nexus-muted mb-2 block">生成提示词 *</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="描述你想要生成的图片..."
                  rows={3}
                  className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-nexus-muted mb-2 block">反向提示词（可选）</label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="不希望出现的元素..."
                  className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 outline-none"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 全局错误提示 ═══ */}
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


// ==================== 子组件：任务进度指示器 ====================

interface TaskProgressIndicatorProps {
  label: string;
  taskId: string;
  status: string;
  accentColor?: string;
}

/**
 * 等待态动效 — 显示进度条 + 呼吸灯 + 状态文字
 */
function TaskProgressIndicator({ label, taskId, status, accentColor = 'var(--color-nexus-primary)' }: TaskProgressIndicatorProps) {
  const statusLabels: Record<string, string> = {
    uploading: '正在上传文件...',
    processing: '任务已提交，等待处理...',
    QUEUED: '排队中，等待 GPU 资源...',
    RUNNING: 'AI 正在生成图片...',
  };

  return (
    <div className="p-5 rounded-xl bg-nexus-bg/30 border border-nexus-border/30 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Loader2 size={20} className="animate-spin" style={{ color: accentColor }} />
          </div>
          {/* 呼吸灯动效 */}
          <motion.div
            className="absolute inset-0 rounded-xl"
            style={{ border: `1px solid ${accentColor}40` }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-nexus-text">{label}</p>
          <p className="text-[10px] text-nexus-muted mt-0.5">
            {statusLabels[status] || '处理中...'} · {taskId.slice(0, 12)}...
          </p>
        </div>
      </div>
      {/* 进度条 */}
      <div className="w-full h-1.5 bg-nexus-bg rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(to right, ${accentColor}, ${accentColor}80)` }}
          animate={{ width: status === 'RUNNING' ? ['30%', '85%'] : ['5%', '30%'] }}
          transition={{ duration: status === 'RUNNING' ? 40 : 15, ease: 'easeOut' }}
        />
      </div>
      <p className="text-[10px] text-nexus-muted/50 text-center">
        图片生成通常需要 30-120 秒，请耐心等待
      </p>
    </div>
  );
}


// ==================== 子组件：任务结果展示 ====================

interface TaskResultDisplayProps {
  type: 'product' | 'model';
  taskId: string;
  resultUrls: string[];
  onReset: () => void;
  accentColor?: string;
}

/**
 * 生成成功后的结果展示 — 图片网格 + 下载 + 重新生成
 */
function TaskResultDisplay({ type, taskId, resultUrls, onReset, accentColor = 'var(--color-nexus-primary)' }: TaskResultDisplayProps) {
  const label = type === 'product' ? '商品主图' : '模特图';

  /**
   * 跨域图片下载 — fetch blob 再触发本地下载
   * NOTE: RunningHub CDN 是跨域资源，<a download> 对跨域 URL 无效
   * 浏览器会忽略 download 属性直接打开新标签页，必须先转 blob
   */
  const downloadOneImage = async (url: string, fileName: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 延迟释放 blob URL，确保下载已启动
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      // 降级：直接打开链接
      window.open(url, '_blank');
    }
  };

  /** 逐一下载全部图片，间隔 500ms 避免浏览器并发限制 */
  const downloadAll = () => {
    resultUrls.forEach((url, idx) => {
      setTimeout(() => {
        downloadOneImage(url, `${label}_${taskId.slice(0, 8)}_${idx + 1}.png`);
      }, idx * 500);
    });
  };

  return (
    <div className="space-y-4">
      {/* 状态标题 */}
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-400" />
        <span className="text-xs font-bold text-emerald-400">生成完成</span>
        <span className="text-[9px] text-nexus-muted/50 font-mono ml-auto">
          {taskId.slice(0, 12)}...
        </span>
      </div>

      {/* 图片网格 */}
      <div className={`grid gap-3 ${resultUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {resultUrls.map((url, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="rounded-xl overflow-hidden border border-nexus-border/20 bg-nexus-bg/30 group relative"
          >
            <img
              src={url}
              alt={`${label} ${idx + 1}`}
              className="w-full object-cover"
              style={{ aspectRatio: resultUrls.length === 1 ? 'auto' : '1/1' }}
            />
            {/* 悬浮下载按钮 — 使用 fetch blob 方式 */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={() => downloadOneImage(url, `${label}_${taskId.slice(0, 8)}_${idx + 1}.png`)}
                className="cursor-target px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-nexus-inverse"
                style={{ backgroundColor: accentColor }}
              >
                <Download size={14} />
                下载
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={downloadAll}
          className="cursor-target flex-1 h-11 flex items-center justify-center gap-2 text-xs font-bold rounded-xl border transition-all"
          style={{
            backgroundColor: `${accentColor}10`,
            borderColor: `${accentColor}30`,
            color: accentColor,
          }}
        >
          <Download size={14} />
          下载全部（{resultUrls.length} 张）
        </button>
        <button
          onClick={onReset}
          className="cursor-target flex-1 h-11 flex items-center justify-center gap-2 bg-nexus-surface/30 border border-nexus-border/40 text-nexus-muted text-xs font-bold rounded-xl hover:border-nexus-primary/30 hover:text-nexus-text transition-all"
        >
          <RotateCcw size={14} />
          重新生成
        </button>
      </div>
    </div>
  );
}


// ==================== 子组件：失败状态展示 ====================

interface TaskFailedDisplayProps {
  message?: string;
  onRetry: () => void;
}

function TaskFailedDisplay({ message, onRetry }: TaskFailedDisplayProps) {
  // NOTE: RunningHub OOM 错误的 exception_message 包含 → 前缀的建议项
  const isOom = message?.includes('显存') || message?.includes('OutOfMemory');
  const suggestions = message
    ? message.split('\n').filter((line) => line.trim().startsWith('→')).map((l) => l.trim().replace(/^→\s*/, ''))
    : [];
  const titleMatch = message?.match(/【(.+?)】/);
  const errorTitle = titleMatch ? titleMatch[1] : '生成失败';

  return (
    <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className={isOom ? 'text-amber-400' : 'text-red-400'} />
        <span className={`text-xs font-bold ${isOom ? 'text-amber-400' : 'text-red-400'}`}>
          {errorTitle}
        </span>
      </div>
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
        message && <p className="text-[10px] text-red-400/70 leading-relaxed whitespace-pre-line">{message}</p>
      )}
      {/* NOTE: 明确告知用户失败不扣费，降低用户焦虑 */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/8 border border-emerald-500/15 rounded-lg">
        <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
        <span className="text-[10px] text-emerald-400/80">本次任务未扣除积分，重试不会额外收费</span>
      </div>
      <button
        onClick={onRetry}
        className="cursor-target flex items-center gap-2 text-[10px] text-nexus-muted hover:text-nexus-text transition-colors"
      >
        <RotateCcw size={10} />
        调整参数后重试
      </button>
    </div>
  );
}
