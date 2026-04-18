import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Beaker,
  Send,
  Loader2,
  Copy,
  Check,
  Download,
  Quote,
  Tag,
  FileText,
  Droplets,
  FlaskConical,
  ChevronRight,
  ImageIcon,
  BookOpen,
  Save,
  Trash2,
  Calendar,
} from 'lucide-react';

/**
 * 知识蒸馏工具 — 将公众号文章蒸馏为多篇知识文档
 * NOTE: 布局设计：
 * - 顶部：宽幅输入区（URL 输入框充足宽度，w-full 始终撑满）
 * - 下方：左右双栏 — 左侧文档列表(固定宽度) | 右侧选中文档详情(grid 固定)
 * 支持提取文章中的图片并在内容中渲染
 */

// ==================== 类型定义 ====================

interface KnowledgeDoc {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  sourceQuotes: string[];
}

interface DistillResult {
  articleTitle: string;
  articleAuthor: string;
  documents: KnowledgeDoc[];
  totalDocuments: number;
  images?: string[];
}

// ==================== API 配置 ====================

const API_BASE = 'http://localhost:8000';

// localStorage key
const STORAGE_KEY = 'kunlun_lab_distill_latest';
// NOTE: 持久化进行中的蒸馏任务，遵循 async-task-persist-on-navigate 模式
const PENDING_KEY = 'kunlun_lab_distill_pending';

// ==================== 知识库类型 ====================

interface KnowledgeRecord {
  id: string;
  title: string;
  summary: string;
  content?: string;
  tags: string[];
  sourceTitle: string;
  sourceAuthor: string;
  sourceUrl?: string;
  sourceQuotes?: string[];
  createdAt: string;
}

/** 当前活动标签页 */
type ActiveTab = 'distill' | 'knowledge';

// ==================== 内容渲染工具 ====================

/**
 * 将包含 markdown 图片语法 ![alt](url) 的文本解析为 React 节点
 * NOTE: 微信 CDN 图片 (mmbiz.qpic.cn) 通常可直接访问，无需代理
 */
function renderContentWithImages(content: string): React.ReactNode[] {
  // 空值保护 — 防止 content 为 undefined/null 导致 regex 崩溃
  if (!content) return [];
  // 匹配 markdown 图片语法：![alt](url)
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let imgCount = 0;

  while ((match = imgRegex.exec(content)) !== null) {
    // 图片前的文本
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`text-${lastIndex}`}>
          {content.slice(lastIndex, match.index)}
        </span>
      );
    }

    imgCount++;

    // NOTE: 微信 CDN 图片有防盗链限制（Referer 校验），在浏览器中无法直接显示
    // 改为自定义占位卡片，提示用户下载后查看
    nodes.push(
      <div
        key={`img-${match.index}`}
        className="my-3 inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-nexus-bg/60 border border-nexus-border/40 max-w-[280px]"
      >
        <div className="w-10 h-10 rounded-lg bg-nexus-primary/8 border border-nexus-primary/15 flex items-center justify-center shrink-0">
          <ImageIcon size={16} className="text-nexus-primary/50" />
        </div>
        <div>
          <p className="text-[11px] text-nexus-text/70 font-medium">图片 {imgCount}</p>
          <p className="text-[10px] text-nexus-muted/60">下载文档后查看</p>
        </div>
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  // 剩余文本
  if (lastIndex < content.length) {
    nodes.push(
      <span key={`text-${lastIndex}`}>
        {content.slice(lastIndex)}
      </span>
    );
  }

  return nodes;
}

// ==================== 主组件 ====================

export default function KnowledgeDistillTool() {
  const [url, setUrl] = useState('');
  const [isDistilling, setIsDistilling] = useState(false);
  const [result, setResult] = useState<DistillResult | null>(null);
  const [error, setError] = useState('');
  /** 当前选中查看的文档 ID — 左右展开交互 */
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /** 活动标签页：蒸馏工具 | 知识库 */
  const [activeTab, setActiveTab] = useState<ActiveTab>('distill');
  /** 知识库列表 */
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeRecord[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  /** 知识库中当前查看的文档 */
  const [viewingKnowledge, setViewingKnowledge] = useState<KnowledgeRecord | null>(null);
  /** 保存状态 */
  const [isSaving, setIsSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  // ---- localStorage 持久化：恢复最新一次蒸馏结果 / 恢复进行中的任务 ----
  useEffect(() => {
    try {
      // NOTE: 优先检查是否有未完成的蒸馏任务（用户中途离开的场景）
      const pendingRaw = localStorage.getItem(PENDING_KEY);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw);
        if (pending.url && pending.status === 'distilling') {
          // 恢复 URL 并自动重新发起蒸馏请求
          setUrl(pending.url);
          // NOTE: 不在这里直接 setResult(null) — handleDistill 会做
          // 延迟触发，等组件渲染完毕
          const timer = setTimeout(() => {
            resumeDistill(pending.url);
          }, 300);
          return () => clearTimeout(timer);
        } else {
          // pending 状态异常，清除
          localStorage.removeItem(PENDING_KEY);
        }
      }

      // 无进行中任务时，恢复上次完成的结果
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.result) {
          setResult(parsed.result);
          setUrl(parsed.url || '');
          // 默认选中第一篇
          if (parsed.result.documents?.length > 0) {
            setSelectedDocId(parsed.result.documents[0].id);
          }
        }
      }
    } catch {
      // localStorage 损坏时静默忽略
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 执行蒸馏请求的核心逻辑（共用于首次提交和导航恢复）
   * NOTE: 抽取为独立函数，handleDistill 和 resumeDistill 共用
   */
  const executeDistill = useCallback(async (targetUrl: string) => {
    setIsDistilling(true);
    setError('');
    setResult(null);
    setSelectedDocId(null);

    // NOTE: 立即将「进行中」状态写入 localStorage，遵循 async-task-persist-on-navigate
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        url: targetUrl,
        status: 'distilling',
        startedAt: new Date().toISOString(),
      }));
    } catch { /* 静默处理 */ }

    try {
      // NOTE: 长文章蒸馏可能需要较长时间（含图片提取），5 分钟超时与后端对齐
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      const resp = await fetch(`${API_BASE}/api/lab/distill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${resp.status}`);
      }

      const data: DistillResult = await resp.json();
      setResult(data);
      // 默认选中第一篇文档
      if (data.documents.length > 0) {
        setSelectedDocId(data.documents[0].id);
      }
      // NOTE: 蒸馏完成 — 写入完成结果 + 清除 pending 标记
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          result: data,
          url: targetUrl,
          savedAt: new Date().toISOString(),
        }));
        localStorage.removeItem(PENDING_KEY);
      } catch {
        // 存储失败时静默忽略（可能是配额满）
      }
    } catch (err) {
      // NOTE: 蒸馏失败 — 清除 pending 标记，避免无限重试
      localStorage.removeItem(PENDING_KEY);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('蒸馏超时，文章可能过长，请稍后重试');
      } else if (err instanceof TypeError && (err.message === 'Failed to fetch' || err.message.includes('NetworkError'))) {
        setError('网络连接失败，请检查后端服务是否启动');
      } else {
        setError(err instanceof Error ? err.message : '蒸馏失败，请检查链接后重试');
      }
    } finally {
      setIsDistilling(false);
    }
  }, []);

  /**
   * 提交蒸馏请求（用户主动点击）
   * NOTE: 调用后端 /api/lab/distill 接口，等待完整蒸馏结果
   */
  const handleDistill = useCallback(async () => {
    if (!url.trim()) return;
    await executeDistill(url.trim());
  }, [url, executeDistill]);

  /**
   * 恢复蒸馏请求（组件挂载时检测到未完成任务后自动触发）
   * NOTE: 用户离开页面再回来时，自动重新发起之前中断的蒸馏
   */
  const resumeDistill = useCallback(async (pendingUrl: string) => {
    await executeDistill(pendingUrl);
  }, [executeDistill]);

  /**
   * 复制单篇文档内容
   */
  const copyDocument = useCallback(async (doc: KnowledgeDoc) => {
    const text = `# ${doc.title}\n\n${doc.summary}\n\n${doc.content}\n\n---\n关键标签: ${doc.tags.join(', ')}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  /**
   * 下载单篇文档为独立 Markdown 文件
   * NOTE: 跟数字工厂 ImageGeneratorTool.downloadOneImage 相同模式
   * 使用 TextEncoder + 延迟 revokeObjectURL 确保下载完整
   */
  const downloadOneDoc = useCallback((doc: KnowledgeDoc, index: number) => {
    let md = `# ${doc.title}\n\n`;
    md += `> ${doc.summary}\n\n`;
    md += `${doc.content}\n\n`;
    md += `**标签**: ${doc.tags.join(' · ')}\n\n`;

    if (doc.sourceQuotes.length > 0) {
      md += `**金句摘录**:\n\n`;
      for (const q of doc.sourceQuotes) {
        md += `- "${q}"\n`;
      }
      md += `\n`;
    }

    const encoder = new TextEncoder();
    const blob = new Blob([encoder.encode(md)], { type: 'text/markdown;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const safeName = doc.title.replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${index + 1}_${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // NOTE: 延迟释放，给浏览器足够时间读取 Blob 数据
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 3000);
  }, []);

  /**
   * 逐一下载全部文档，间隔 500ms 避免浏览器并发限制
   * NOTE: 学习自 ImageGeneratorTool.downloadAll 的成熟模式
   */
  const downloadAll = useCallback(() => {
    if (!result) return;
    result.documents.forEach((doc, idx) => {
      setTimeout(() => {
        downloadOneDoc(doc, idx);
      }, idx * 500);
    });
  }, [result, downloadOneDoc]);

  // ==================== 知识库功能 ====================

  /**
   * 加载知识库列表
   */
  const loadKnowledgeList = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/lab/knowledge`);
      if (resp.ok) {
        const data = await resp.json();
        setKnowledgeList(data.items || []);
      }
    } catch {
      // 静默失败
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  /**
   * 切换到知识库标签页时自动加载列表
   */
  useEffect(() => {
    if (activeTab === 'knowledge') {
      loadKnowledgeList();
    }
  }, [activeTab, loadKnowledgeList]);

  /**
   * 保存蒸馏结果到知识库
   * NOTE: 批量保存当前所有蒸馏文档
   */
  const saveToKnowledge = useCallback(async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const docs = result.documents.map((doc) => ({
        title: doc.title,
        summary: doc.summary,
        content: doc.content,
        tags: doc.tags,
        sourceQuotes: doc.sourceQuotes,
        sourceTitle: result.articleTitle,
        sourceAuthor: result.articleAuthor,
        sourceUrl: url,
      }));
      const resp = await fetch(`${API_BASE}/api/lab/knowledge/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs),
      });
      if (resp.ok) {
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 2000);
      }
    } catch {
      // 保存失败静默处理
    } finally {
      setIsSaving(false);
    }
  }, [result, url]);

  /**
   * 删除知识库中的一条记录
   */
  const deleteKnowledge = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${API_BASE}/api/lab/knowledge/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setKnowledgeList((prev) => prev.filter((item) => item.id !== id));
        if (viewingKnowledge?.id === id) {
          setViewingKnowledge(null);
        }
      }
    } catch {
      // 静默失败
    }
  }, [viewingKnowledge]);

  /**
   * 查看知识库中某条记录的完整内容
   */
  const viewKnowledgeDetail = useCallback(async (id: string) => {
    try {
      const resp = await fetch(`${API_BASE}/api/lab/knowledge/${id}`);
      if (resp.ok) {
        const data = await resp.json();
        setViewingKnowledge(data);
      }
    } catch {
      // 静默失败
    }
  }, []);

  const selectedDoc = useMemo(
    () => result?.documents.find((d) => d.id === selectedDocId) ?? null,
    [result, selectedDocId]
  );

  return (
    // NOTE: w-full 确保容器始终撑满父级宽度
    <div className="w-full space-y-5">
      {/* ==================== Tab 切换栏 ==================== */}
      <div className="flex items-center gap-1 bg-nexus-bg rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('distill')}
          className={`cursor-target flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'distill'
              ? 'bg-nexus-surface text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.1)]'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}
        >
          <FlaskConical size={15} />
          蒸馏工具
        </button>
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`cursor-target flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'knowledge'
              ? 'bg-nexus-surface text-nexus-primary shadow-[0_0_12px_rgba(62,237,231,0.1)]'
              : 'text-nexus-muted hover:text-nexus-text'
          }`}
        >
          <BookOpen size={15} />
          知识库
          {knowledgeList.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-nexus-primary/10 text-nexus-primary/70">
              {knowledgeList.length}
            </span>
          )}
        </button>
      </div>

      {/* ==================== 蒸馏工具内容 ==================== */}
      {activeTab === 'distill' && (<>
      {/* ==================== 输入区 — 宽幅横向布局 ==================== */}
      <div
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 relative overflow-hidden"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
      >
        {/* 装饰 — 顶部瓶口光带 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-[2px] bg-gradient-to-r from-transparent via-nexus-primary/20 to-transparent" />

        {/* 标题行 */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-all duration-300 ${
              isDistilling
                ? 'bg-nexus-primary/15 border-nexus-primary/40 shadow-cyber-glow animate-ring-pulse'
                : 'bg-nexus-primary/10 border-nexus-primary/20'
            }`}
          >
            <Beaker
              size={18}
              className={`text-nexus-primary ${isDistilling ? 'animate-liquid-wobble' : ''}`}
            />
          </div>
          <div>
            <h3 className="text-sm font-bold text-nexus-text">输入原料</h3>
            <p className="text-[11px] text-nexus-muted">
              粘贴微信公众号文章链接，AI 将智能蒸馏提取核心知识
            </p>
          </div>
        </div>

        {/* NOTE: 输入框独占一行，w-full 最大化宽度方便用户查看完整链接 */}
        <div className="flex gap-3">
          <div className="flex-1 relative group">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isDistilling && handleDistill()}
              placeholder="https://mp.weixin.qq.com/s/..."
              disabled={isDistilling}
              className="cursor-target w-full px-4 py-3 rounded-xl bg-nexus-bg border border-nexus-border text-sm text-nexus-text placeholder-nexus-muted/50 outline-none transition-all duration-200 focus:border-nexus-primary focus:shadow-[0_0_10px_rgba(62,237,231,0.2)] disabled:opacity-50 font-mono"
            />
          </div>
          <button
            onClick={handleDistill}
            disabled={isDistilling || !url.trim()}
            className="cursor-target shrink-0 px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-nexus-primary text-nexus-inverse hover:shadow-cyber-glow active:scale-[0.98]"
          >
            {isDistilling ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                蒸馏中...
              </>
            ) : (
              <>
                <Send size={16} />
                开始蒸馏
              </>
            )}
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400"
          >
            {error}
          </motion.div>
        )}
      </div>

      {/* ==================== 蒸馏管道 — 处理动画 ==================== */}
      {isDistilling && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-4 py-4"
        >
          <div className="relative w-40 h-[3px] bg-nexus-border/50 rounded-full overflow-hidden">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(62,237,231,0.4) 50%, transparent)',
                backgroundSize: '200% 100%',
                animation: 'distill-flow-h 2s ease-in-out infinite',
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Droplets size={14} className="text-nexus-primary animate-bounce" />
            <span className="text-xs text-nexus-muted animate-pulse">
              正在蒸馏提取知识精华...
            </span>
          </div>
          <div className="relative w-40 h-[3px] bg-nexus-border/50 rounded-full overflow-hidden">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(62,237,231,0.4) 50%, transparent)',
                backgroundSize: '200% 100%',
                animation: 'distill-flow-h 2s ease-in-out infinite 0.5s',
              }}
            />
          </div>
        </motion.div>
      )}

      {/* ==================== 结果区 — 左右双栏固定布局 ==================== */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="w-full space-y-4"
          >
            {/* 蒸馏结果头部信息 */}
            <div
              className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 relative overflow-hidden"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
            >
              <div
                className="absolute inset-0 pointer-events-none opacity-30"
                style={{
                  background: 'radial-gradient(ellipse at 20% 50%, rgba(62,237,231,0.08), transparent 60%)',
                }}
              />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center shrink-0">
                    <FlaskConical size={16} className="text-nexus-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-nexus-text truncate">
                      {result.articleTitle || '蒸馏完成'}
                    </h3>
                    <p className="text-xs text-nexus-muted mt-0.5">
                      {result.articleAuthor && `来源: ${result.articleAuthor} · `}
                      成功蒸馏出{' '}
                      <span className="text-nexus-primary font-bold">{result.totalDocuments}</span>{' '}
                      篇知识文档
                      {(result.images?.length ?? 0) > 0 && (
                        <span className="ml-2">
                          · 提取{' '}
                          <span className="text-nexus-primary font-bold">{result.images!.length}</span>{' '}
                          张图片
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={saveToKnowledge}
                    disabled={isSaving}
                    className={`cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                      savedHint
                        ? 'bg-nexus-primary/10 border-nexus-primary/30 text-nexus-primary'
                        : 'bg-nexus-bg border-nexus-border text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30'
                    }`}
                  >
                    {savedHint ? <Check size={13} /> : isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {savedHint ? '已保存' : '保存到知识库'}
                  </button>
                  <button
                    onClick={downloadAll}
                    className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nexus-bg border border-nexus-border text-xs text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
                  >
                    <Download size={13} />
                    全部下载（{result.documents.length} 篇）
                  </button>
                </div>
              </div>
            </div>
            {/*
             * ---- 左右双栏：文档列表 + 文档详情 ----
             * NOTE: 使用 grid 固定两栏比例，切换文档时不会因内容变化导致宽度跳动
             */}
            {/* NOTE: calc(100vh - 340px) 确保 grid 容器不超出页面，右栏面板内部滚动 */}
            <div
              className="grid grid-cols-[280px_1fr] gap-4"
              style={{ height: 'calc(80vh - 340px)', minHeight: '300px' }}
            >
              {/* 左栏 — 文档列表（固定 280px，内部滚动） */}
              <div className="space-y-2 overflow-y-auto">
                {result.documents.map((doc, index) => {
                  const isSelected = selectedDocId === doc.id;
                  return (
                    <motion.button
                      key={doc.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.08 }}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`cursor-target w-full text-left p-4 rounded-xl border transition-all duration-200 group relative ${
                        isSelected
                          ? 'bg-nexus-surface border-nexus-primary/30 shadow-[inset_0_0_15px_rgba(62,237,231,0.06)]'
                          : 'bg-nexus-surface/50 border-nexus-border/50 hover:bg-nexus-surface hover:border-nexus-border'
                      }`}
                    >
                      {/* 选中指示条 */}
                      {isSelected && (
                        <motion.div
                          layoutId="doc-indicator"
                          className="absolute left-0 top-3 bottom-3 w-[3px] bg-nexus-primary rounded-r-full shadow-[0_0_8px_rgba(62,237,231,0.6)]"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}

                      <div className="flex items-start gap-3">
                        {/* 编号 */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-nexus-primary/15 text-nexus-primary border border-nexus-primary/25'
                              : 'bg-nexus-bg text-nexus-muted border border-nexus-border'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`text-sm font-medium truncate transition-colors ${
                              isSelected ? 'text-nexus-primary' : 'text-nexus-text group-hover:text-nexus-text'
                            }`}
                          >
                            {doc.title}
                          </h4>
                          <p className="text-[11px] text-nexus-muted mt-1 line-clamp-2 leading-relaxed">
                            {doc.summary}
                          </p>
                          {/* 标签 */}
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {doc.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-nexus-primary/5 text-nexus-primary/50 border border-nexus-primary/10"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* 展开箭头 */}
                        <ChevronRight
                          size={14}
                          className={`shrink-0 mt-1 transition-all ${
                            isSelected ? 'text-nexus-primary' : 'text-nexus-border group-hover:text-nexus-muted'
                          }`}
                        />
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* 右栏 — 文档详情面板（内部滚动，不超出页面） */}
              <div className="min-w-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  {selectedDoc ? (
                    <motion.div
                      key={selectedDoc.id}
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 overflow-y-auto space-y-5"
                      style={{ height: '100%', maxHeight: '100%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
                    >
                      {/* 文档标题 + 操作 */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-nexus-text">
                            {selectedDoc.title}
                          </h3>
                          <p className="text-xs text-nexus-muted mt-1 leading-relaxed">
                            {selectedDoc.summary}
                          </p>
                        </div>
                        <button
                          onClick={() => copyDocument(selectedDoc)}
                          className="cursor-target shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nexus-bg border border-nexus-border text-xs text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
                        >
                          {copiedId === selectedDoc.id ? (
                            <>
                              <Check size={12} className="text-nexus-primary" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              复制
                            </>
                          )}
                        </button>
                      </div>

                      {/* 蒸馏内容 — 支持渲染内嵌图片 */}
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-nexus-muted mb-2">
                          <Beaker size={12} />
                          蒸馏内容
                        </div>
                        <div className="text-sm text-nexus-text/85 bg-nexus-bg/40 rounded-xl p-5 border border-nexus-border/30 leading-[1.85] whitespace-pre-wrap break-words">
                          {renderContentWithImages(selectedDoc.content)}
                        </div>
                      </div>

                      {/* 原文金句 */}
                      {selectedDoc.sourceQuotes.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 text-xs text-nexus-muted mb-2">
                            <Quote size={12} />
                            原文金句
                          </div>
                          <div className="space-y-2">
                            {selectedDoc.sourceQuotes.map((quote, qi) => (
                              <div
                                key={qi}
                                className="flex items-start gap-2.5 text-xs text-nexus-secondary bg-nexus-secondary/5 rounded-lg p-3 border border-nexus-secondary/10"
                              >
                                <Quote size={10} className="shrink-0 mt-0.5 opacity-60" />
                                <span className="italic leading-relaxed">{quote}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 标签 */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <Tag size={11} className="text-nexus-muted" />
                        {selectedDoc.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-nexus-primary/8 text-nexus-primary/70 border border-nexus-primary/15"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    /* 未选中文档时的占位 */
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-nexus-surface/30 border border-nexus-border/30 border-dashed rounded-2xl h-full flex items-center justify-center"
                    >
                      <div className="text-center">
                        <FileText size={24} className="text-nexus-border mx-auto mb-2" />
                        <p className="text-xs text-nexus-muted/60">
                          选择左侧文档查看详情
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 空状态提示 — 无结果时显示 */}
      {!isDistilling && !result && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-xl bg-nexus-surface border-2 border-nexus-border border-dashed flex items-center justify-center relative">
              <Beaker size={32} className="text-nexus-border" />
              <div className="absolute bottom-2 left-3 w-1.5 h-1.5 rounded-full bg-nexus-primary/10" />
              <div className="absolute bottom-4 right-4 w-1 h-1 rounded-full bg-nexus-secondary/10" />
            </div>
            <div className="w-[2px] h-6 bg-nexus-border/30 mx-auto mt-1" />
            <div className="w-10 h-6 mx-auto rounded-b-lg bg-nexus-surface border border-nexus-border border-dashed border-t-0" />
          </div>
          <p className="text-sm text-nexus-muted">
            粘贴公众号文章链接，开始知识蒸馏
          </p>
          <p className="text-xs text-nexus-muted/50 mt-1.5">
            支持微信公众号、以及其他公开文章页面
          </p>
        </motion.div>
      )}
      </>)}

      {/* ==================== 知识库标签页 ==================== */}
      {activeTab === 'knowledge' && (
        <div className="w-full space-y-4">
          {/* 知识库头部 */}
          <div
            className="bg-nexus-surface border border-nexus-border rounded-2xl p-4 relative overflow-hidden"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
          >
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
                  <BookOpen size={16} className="text-nexus-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-nexus-text">知识库</h3>
                  <p className="text-xs text-nexus-muted mt-0.5">
                    已收录 <span className="text-nexus-primary font-bold">{knowledgeList.length}</span> 篇知识文档
                  </p>
                </div>
              </div>
              <button
                onClick={loadKnowledgeList}
                disabled={knowledgeLoading}
                className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nexus-bg border border-nexus-border text-xs text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
              >
                {knowledgeLoading ? <Loader2 size={13} className="animate-spin" /> : <Droplets size={13} />}
                刷新
              </button>
            </div>
          </div>

          {/* 知识库双栏内容 */}
          {knowledgeList.length > 0 ? (
            <div
              className="grid grid-cols-[280px_1fr] gap-4"
              style={{ height: 'calc(80vh - 340px)', minHeight: '300px' }}
            >
              {/* 左栏 — 知识文档列表 */}
              <div className="space-y-2 overflow-y-auto">
                {knowledgeList.map((item) => {
                  const isSelected = viewingKnowledge?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => viewKnowledgeDetail(item.id)}
                      className={`cursor-target w-full text-left p-4 rounded-xl border transition-all duration-200 relative group cursor-pointer ${
                        isSelected
                          ? 'bg-nexus-surface border-nexus-primary/30 shadow-[inset_0_0_15px_rgba(62,237,231,0.06)]'
                          : 'bg-nexus-surface/50 border-nexus-border/50 hover:bg-nexus-surface hover:border-nexus-border'
                      }`}
                    >
                      {/* 选中指示条 */}
                      {isSelected && (
                        <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-nexus-primary rounded-r-full shadow-[0_0_8px_rgba(62,237,231,0.6)]" />
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`text-sm font-medium truncate transition-colors ${
                              isSelected ? 'text-nexus-primary' : 'text-nexus-text'
                            }`}
                          >
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-nexus-muted mt-1 line-clamp-2 leading-relaxed">
                            {item.summary}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center gap-1 text-[9px] text-nexus-muted/60">
                              <Calendar size={9} />
                              {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                            </div>
                            {item.sourceAuthor && (
                              <span className="text-[9px] text-nexus-muted/40">· {item.sourceAuthor}</span>
                            )}
                          </div>
                          {/* 标签 */}
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {item.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-nexus-primary/5 text-nexus-primary/50 border border-nexus-primary/10"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteKnowledge(item.id); }}
                          className="cursor-target shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-nexus-muted hover:text-red-400 transition-all"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 右栏 — 知识文档详情 */}
              <div className="min-w-0 overflow-hidden">
                {viewingKnowledge ? (
                  <div
                    className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 overflow-y-auto space-y-5"
                    style={{ height: '100%', maxHeight: '100%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)' }}
                  >
                    {/* 标题 + 操作 */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-nexus-text">{viewingKnowledge.title}</h3>
                        <p className="text-xs text-nexus-muted mt-1 leading-relaxed">{viewingKnowledge.summary}</p>
                        {viewingKnowledge.sourceTitle && (
                          <p className="text-[10px] text-nexus-muted/50 mt-1">
                            来源: {viewingKnowledge.sourceTitle}
                            {viewingKnowledge.sourceAuthor && ` · ${viewingKnowledge.sourceAuthor}`}
                          </p>
                        )}
                      </div>
                      {/* 下载按钮 */}
                      <button
                        onClick={() => {
                          const doc = viewingKnowledge;
                          let md = `# ${doc.title}\n\n`;
                          md += `> ${doc.summary}\n\n`;
                          md += `${doc.content || ''}\n\n`;
                          if (doc.tags?.length) md += `**标签**: ${doc.tags.join(' · ')}\n\n`;
                          if (doc.sourceQuotes?.length) {
                            md += `---\n\n**原文金句**\n\n`;
                            doc.sourceQuotes.forEach((q) => { md += `> ${q}\n\n`; });
                          }
                          if (doc.sourceTitle) md += `---\n来源: ${doc.sourceTitle}${doc.sourceAuthor ? ` · ${doc.sourceAuthor}` : ''}\n`;
                          const blob = new Blob([new TextEncoder().encode(md)], { type: 'text/markdown;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${doc.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(url), 3000);
                        }}
                        className="cursor-target shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nexus-bg border border-nexus-border text-xs text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/30 transition-all"
                      >
                        <Download size={13} />
                        下载
                      </button>
                    </div>

                    {/* 正文 */}
                    <div className="bg-nexus-bg rounded-xl p-5 border border-nexus-border/50">
                      <div className="text-sm text-nexus-text/85 leading-[1.8] whitespace-pre-wrap break-words">
                        {renderContentWithImages(viewingKnowledge.content || '')}
                      </div>
                    </div>

                    {/* 金句 */}
                    {viewingKnowledge.sourceQuotes && viewingKnowledge.sourceQuotes.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-nexus-muted">
                          <Quote size={11} />
                          <span className="font-medium">原文金句</span>
                        </div>
                        {viewingKnowledge.sourceQuotes.map((quote, qi) => (
                          <div
                            key={qi}
                            className="flex items-start gap-2.5 text-xs text-nexus-secondary bg-nexus-secondary/5 rounded-lg p-3 border border-nexus-secondary/10"
                          >
                            <Quote size={10} className="shrink-0 mt-0.5 opacity-60" />
                            <span className="italic leading-relaxed">{quote}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 标签 */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <Tag size={11} className="text-nexus-muted" />
                      {viewingKnowledge.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-nexus-primary/8 text-nexus-primary/70 border border-nexus-primary/15"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-nexus-surface/30 border border-nexus-border/30 border-dashed rounded-2xl h-full flex items-center justify-center">
                    <div className="text-center">
                      <BookOpen size={24} className="text-nexus-border mx-auto mb-2" />
                      <p className="text-xs text-nexus-muted/60">
                        选择左侧文档查看详情
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 知识库空状态 */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div className="w-20 h-20 rounded-xl bg-nexus-surface border-2 border-nexus-border border-dashed flex items-center justify-center mb-4">
                <BookOpen size={32} className="text-nexus-border" />
              </div>
              <p className="text-sm text-nexus-muted">
                {knowledgeLoading ? '加载中...' : '知识库为空'}
              </p>
              <p className="text-xs text-nexus-muted/50 mt-1.5">
                蒸馏文章后，点击「保存到知识库」即可收录
              </p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
