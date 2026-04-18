import { useState, useEffect, useRef, useCallback } from 'react';
import { addAssetRecordWithSize, addHistoryRecord, scopedStorage } from '../../utils/factory-records';
import { useAuth } from '../../contexts/AuthContext';
import { useCreditsGuard } from '../../hooks/useCreditsGuard';
import { CREDIT_JSON_PROMPT } from './factory-credits';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import {
  Braces,
  Loader2,
  Copy,
  Check,
  Send,
  Plus,
  Trash2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  User,
  Sparkles,
  ImagePlus,
  Zap,
  X,
} from 'lucide-react';

/**
 * JSON提示词大师 — 对话式聊天界面
 * NOTE: 接入 Coze 智能体 API，通过 SSE 流式对话实现
 * 智能生成/优化/反推 JSON 结构化提示词
 * 支持会话历史和续聊功能
 */

// ── 类型定义 ────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 是否正在流式接收中 */
  streaming?: boolean;
  /** 用户消息附带的图片预览 URL（仅前端展示用） */
  imagePreview?: string;
}

interface ConversationInfo {
  conversationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// ── 预设快速提问（与 Coze 智能体配置保持同步） ─────────────────

const PRESET_QUESTIONS = [
  {
    icon: '🎨',
    title: '生成 AI 绘图提示词',
    text: '帮我生成一个护肤品主图的 AI 绘图提示词',
  },
  {
    icon: '🔧',
    title: '优化成标准 JSON',
    text: '我有一段粗糙的产品文案，帮我优化成标准 JSON 提示词',
  },
  {
    icon: '🎙️',
    title: '生成直播话术模板',
    text: '我想给直播间写一段开场话术，帮我生成提示词模板',
  },
];

// ── 欢迎开场白（与 Coze 智能体配置保持同步） ──────────────────

const WELCOME_MESSAGE = `您好，我是「JSON 提示词大师」。

我专注于将你的电商需求转化为标准化 JSON 提示词，智能生成/优化结构化 JSON 提示词，提供不同电商场景下的 prompt 模板库。

告诉我你的需求，我来输出您需要的 JSON Prompt。`;

// ── Markdown 代码块组件（带复制按钮） ───────────────────────────

/**
 * 从 React children 中递归提取纯文本
 * NOTE: rehype-highlight 会将代码块转为 span 嵌套结构，
 * String(children) 会变成 [object Object]，必须递归提取
 */
function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return '';
}

/**
 * 自定义代码块渲染器
 * NOTE: 为代码块添加一键复制功能，使用 ref.textContent 作为后备
 */
function CodeBlock({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const isInline = !className;

  if (isInline) {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-nexus-primary/10 text-nexus-primary text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    // 优先从 DOM 获取纯文本，再用递归提取作为后备
    const text = codeRef.current?.textContent || extractText(children);
    navigator.clipboard.writeText(text.replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-3">
      <button
        onClick={handleCopy}
        className="cursor-target absolute top-2 right-2 px-2 py-1 text-[10px] rounded bg-nexus-border/80 text-nexus-muted hover:text-nexus-text hover:bg-nexus-border transition-all opacity-0 group-hover/code:opacity-100 flex items-center gap-1 z-10"
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? '已复制' : '复制'}
      </button>
      <code ref={codeRef} className={className} {...props}>
        {children}
      </code>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────

// localStorage 缓存 key — 会话列表缓存，避免仅依赖 API 导致时有时无
const LS_CONVERSATIONS_KEY = 'kunlun_json_prompt_conversations';

export default function JsonPromptMasterTool() {
  const { consumeCredits } = useAuth();
  const { checkCredits } = useCreditsGuard();
  // 对话状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 图片附件状态
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [attachedImagePreview, setAttachedImagePreview] = useState<string | null>(null);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // 会话管理
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // NOTE: 标记是否已完成首次 localStorage 加载，避免空数组覆盖
  const initializedRef = useRef(false);

  // DOM 引用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── 自动滚动到底部 ──────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── 对话持久化（切换页面不丢失） ─────────────────────────────

  const LS_MESSAGES_KEY = 'kunlun_json_prompt_messages';
  const LS_CONV_ID_KEY = 'kunlun_json_prompt_conv_id';

  // NOTE: 组件挂载时恢复上次对话 + 会话列表缓存
  useEffect(() => {
    try {
      const savedMsgs = scopedStorage.getItem(LS_MESSAGES_KEY);
      const savedConvId = scopedStorage.getItem(LS_CONV_ID_KEY);
      if (savedMsgs) {
        const parsed = JSON.parse(savedMsgs) as ChatMessage[];
        // 清除可能残留的 streaming 状态
        const cleaned = parsed.map((m) => ({ ...m, streaming: false }));
        setMessages(cleaned);
      }
      if (savedConvId) {
        setActiveConversationId(savedConvId);
      }
      // 从 localStorage 缓存恢复会话列表（避免 API 慢/失败时历史记录为空）
      const savedConvs = scopedStorage.getItem(LS_CONVERSATIONS_KEY);
      if (savedConvs) {
        setConversations(JSON.parse(savedConvs));
      }
    } catch {
      // localStorage 读取失败，静默忽略
    }
    // NOTE: 延迟标记初始化完成，避免空数组覆盖 localStorage
    requestAnimationFrame(() => { initializedRef.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: 每次 messages 变化时持久化（需要 initializedRef 保护）
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      // 只保存非空消息列表，不保存 blob: 开头的临时图片预览
      // HACK: blob URL 在页面刷新后会失效，但外部 URL（如 Coze CDN）可以持久化
      const toSave = messages.map((m) => ({
        ...m,
        imagePreview: m.imagePreview?.startsWith('blob:') ? undefined : m.imagePreview,
      }));
      scopedStorage.setItem(LS_MESSAGES_KEY, JSON.stringify(toSave));
    } catch {
      // ignore
    }
  }, [messages]);

  // NOTE: 持久化当前活跃会话 ID
  useEffect(() => {
    if (!initializedRef.current) return;
    try {
      if (activeConversationId) {
        scopedStorage.setItem(LS_CONV_ID_KEY, activeConversationId);
      } else {
        scopedStorage.removeItem(LS_CONV_ID_KEY);
      }
    } catch {
      // ignore
    }
  }, [activeConversationId]);

  // ── 组件卸载清理：中止正在进行的流式请求 ────────────────────
  // NOTE: 用户导航离开工具页面时，如果有正在进行的 SSE 流式请求，
  // 必须 abort 掉，否则 fetch 会在后台继续读取数据并尝试更新已卸载组件的 state
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // ── 加载会话列表 ────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const resp = await fetch('/api/json-prompt/conversations');
      if (resp.ok) {
        const data = await resp.json();
        const convList = data.conversations || [];
        setConversations(convList);
        // NOTE: 同步缓存到 localStorage，下次挂载时可立即显示
        try {
          scopedStorage.setItem(LS_CONVERSATIONS_KEY, JSON.stringify(convList));
        } catch (_) { /* ignore */ }
      }
    } catch (err) {
      // NOTE: 静默处理，不影响主流程；依赖 localStorage 缓存兜底
      console.error('Failed to load conversations:', err);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ── 加载会话消息历史（续聊） ─────────────────────────────────

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const resp = await fetch(`/api/json-prompt/conversations/${conversationId}/messages`);
      if (resp.ok) {
        const data = await resp.json();
        const msgs: ChatMessage[] = (data.messages || []).map(
          (m: { role: string; content: string; imageUrl?: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            // NOTE: 后端已从 object_string 解析出图片 URL，直接传给前端展示
            imagePreview: m.imageUrl || undefined,
          })
        );
        setMessages(msgs);
        setActiveConversationId(conversationId);
      }
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    }
  }, []);

  // ── 图片附件处理（前置声明，供 handleNewConversation 引用） ────

  /**
   * 清除已附加的图片
   */
  const clearAttachedImage = useCallback(() => {
    setAttachedImage(null);
    setAttachedImagePreview(null);
    setImageFileId(null);
    setIsUploadingImage(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // ── 新建对话 ────────────────────────────────────────────────

  const handleNewConversation = useCallback(() => {
    /**
     * NOTE: 如果当前正在流式对话中，禁止创建新对话
     * 提示用户等待当前会话完成
     */
    if (isStreaming) {
      return;
    }

    /**
     * NOTE: 如果当前有对话内容且有 conversationId，
     * 归档当前对话到历史列表（如果尚未在列表中）
     * 然后刷新会话列表以确保最新状态
     */
    if (activeConversationId && messages.length > 0) {
      loadConversations();
    }

    // 清空当前对话状态，进入空白新对话
    setMessages([]);
    setActiveConversationId(null);
    setInputText('');
    clearAttachedImage();
  }, [isStreaming, activeConversationId, messages.length, loadConversations, clearAttachedImage]);

  // ── 图片上传 ──────────────────────────────────────────────

  /**
   * 选择图片后上传到 Coze 文件服务
   * NOTE: 先上传获取 fileId，再在发送消息时携带
   */
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 校验文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // 校验文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过 10MB');
      return;
    }

    setAttachedImage(file);
    setIsUploadingImage(true);

    // 生成本地预览
    const previewUrl = URL.createObjectURL(file);
    setAttachedImagePreview(previewUrl);

    try {
      // 上传到 Coze 文件服务
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/json-prompt/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);

      const data = await resp.json();
      setImageFileId(data.fileId);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('图片上传失败，请重试');
      clearAttachedImage();
    } finally {
      setIsUploadingImage(false);
    }
  }, [clearAttachedImage]);

  /**
   * 一键反推：触发图片选择然后预填提示文本
   */
  const handleQuickReverse = useCallback(() => {
    setInputText('帮我反推这张图片的 JSON 提示词');
    fileInputRef.current?.click();
  }, []);

  // ── 删除会话 ────────────────────────────────────────────────

  const handleDeleteConversation = useCallback(
    async (conversationId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetch(`/api/json-prompt/conversations/${conversationId}`, {
          method: 'DELETE',
        });
        setConversations((prev) =>
          prev.filter((c) => c.conversationId !== conversationId)
        );
        // 如果删除的是当前活跃会话，清空对话区
        if (activeConversationId === conversationId) {
          handleNewConversation();
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    },
    [activeConversationId, handleNewConversation]
  );

  // ── 发送消息（核心） ─────────────────────────────────────────

  const handleSend = useCallback(
    async (text?: string) => {
      // NOTE: 积分前置检查
      if (!checkCredits(CREDIT_JSON_PROMPT, 'JSON提示词大师')) return;
      const messageText = text || inputText.trim();
      if (!messageText || isStreaming) return;
      // 如果图片正在上传，阻止发送
      if (isUploadingImage) return;

      // 捕获当前图片状态（发送后要清除）
      const currentImageFileId = imageFileId;
      const currentImagePreview = attachedImagePreview;
      // NOTE: 记录发送时间，用于 chat_completed 时计算耗时
      const sendStartTime = Date.now();
      // 添加用户消息（含可能的图片预览）
      const userMsg: ChatMessage = {
        role: 'user',
        content: messageText,
        imagePreview: currentImagePreview || undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setIsStreaming(true);

      // 清除图片附件（已捕获到局部变量中）
      clearAttachedImage();

      // 添加空的 AI 消息占位（用于流式填充）
      const aiMsg: ChatMessage = { role: 'assistant', content: '', streaming: true };
      setMessages((prev) => [...prev, aiMsg]);

      // 创建 AbortController 以支持取消
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const resp = await fetch('/api/json-prompt/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageText,
            conversationId: activeConversationId,
            // NOTE: 携带图片 fileId 用于一键反推等图片相关场景
            imageFileId: currentImageFileId || undefined,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // NOTE: 保留最后一个可能不完整的行
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);

                if (eventType === 'message_delta') {
                  // 流式追加文本
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + data.content,
                      };
                    }
                    return updated;
                  });
                } else if (eventType === 'chat_completed') {
                  // 对话完成，更新 conversationId
                  if (data.conversation_id) {
                    setActiveConversationId(data.conversation_id);
                  }
                  // 标记流式结束，并提取最终内容用于同步
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        streaming: false,
                      };
                      // NOTE: 同步到资产库和历史记录
                      const resultPreview = last.content.slice(0, 80);
                      const now = new Date().toISOString();
                      const recordId = `json-prompt-${Date.now()}`;

                      addAssetRecordWithSize({
                        id: recordId,
                        name: `JSON提示词_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.md`,
                        source: '数字工厂-JSON提示词大师',
                        type: 'markdown',
                        size: `${(new Blob([last.content]).size / 1024).toFixed(1)} KB`,
                        date: new Date().toLocaleString('zh-CN'),
                        // NOTE: 将 markdown 内容编码为 data URI，确保资产库可直接下载
                        downloadUrl: `data:text/markdown;base64,${btoa(unescape(encodeURIComponent(last.content)))}`,
                        toolId: 'json-prompt-master',
                      });

                      addHistoryRecord({
                        id: recordId,
                        toolName: 'JSON提示词大师',
                        action: `生成/优化 JSON 提示词：${messageText.slice(0, 40)}...`,
                        status: 'success',
                        time: now,
                        duration: `${((Date.now() - sendStartTime) / 1000).toFixed(1)}s`,
                        output: `产出：${resultPreview}...`,
                      });

                      // NOTE: JSON 提示词对话成功后扣除积分（移到 setMessages 外部执行）
                    }
                    return updated;
                  });
                  // NOTE: consumeCredits 必须在 async 上下文中调用，不能放在 setMessages 的同步回调内
                  await consumeCredits(CREDIT_JSON_PROMPT, 'JSON提示词大师');
                  // 刷新会话列表
                  loadConversations();
                } else if (eventType === 'error') {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        content: `❌ 出错了: ${data.message}`,
                        streaming: false,
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // NOTE: JSON 解析失败，可能是不完整的数据，忽略
              }
              eventType = '';
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('Chat stream failed:', err);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: `❌ 请求失败: ${(err as Error).message}`,
              streaming: false,
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [inputText, isStreaming, isUploadingImage, imageFileId, attachedImagePreview, activeConversationId, loadConversations, clearAttachedImage, checkCredits, consumeCredits]
  );

  // ── 键盘事件：Enter 发送、Shift+Enter 换行 ──────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── 渲染 ────────────────────────────────────────────────────

  const isEmptyState = messages.length === 0;

  return (
    <div className="flex h-full min-h-[600px] gap-0 rounded-2xl overflow-hidden border border-nexus-border bg-nexus-bg">
      {/* ── 左侧会话历史栏 ──────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col border-r border-nexus-border bg-nexus-surface overflow-hidden shrink-0"
          >
            {/* 新对话按钮 */}
            <div className="p-3">
              <button
                onClick={handleNewConversation}
                disabled={isStreaming}
                className={`cursor-target w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-nexus-primary/15 to-nexus-secondary/15 border border-nexus-primary/25 text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                  isStreaming
                    ? 'opacity-40 cursor-not-allowed text-nexus-muted'
                    : 'text-nexus-primary hover:from-nexus-primary/25 hover:to-nexus-secondary/25'
                }`}
                title={isStreaming ? '请等待当前对话完成' : '创建新对话'}
              >
                <Plus size={14} />
                {isStreaming ? '对话进行中...' : '新对话'}
              </button>
            </div>

            {/* 会话列表 */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-thin">
              {conversations.map((conv) => (
                <button
                  key={conv.conversationId}
                  onClick={() => loadConversationMessages(conv.conversationId)}
                  className={`cursor-target w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all group/conv flex items-center justify-between gap-2 ${
                    activeConversationId === conv.conversationId
                      ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/20'
                      : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare size={12} className="shrink-0 opacity-60" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.conversationId, e)}
                    className="cursor-target opacity-0 group-hover/conv:opacity-100 p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </button>
              ))}

              {conversations.length === 0 && (
                <div className="text-center py-8 text-nexus-muted/50">
                  <MessageSquare size={20} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[10px]">暂无对话记录</p>
                </div>
              )}
            </div>

            {/* 折叠按钮 */}
            <div className="p-2 border-t border-nexus-border/50">
              <button
                onClick={() => setSidebarOpen(false)}
                className="cursor-target w-full py-1.5 text-nexus-muted hover:text-nexus-text text-[10px] flex items-center justify-center gap-1 transition-all"
              >
                <PanelLeftClose size={12} />
                收起
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 主对话区 ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-nexus-border/50">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="cursor-target p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface transition-all"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Braces size={16} className="text-nexus-primary" />
              <span className="text-xs font-bold text-nexus-text">JSON 提示词大师</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/20 font-mono">
                Coze
              </span>
            </div>
          </div>
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* 空白状态 — 欢迎 + 预设问题 */}
          {isEmptyState && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full py-12"
            >
              {/* 欢迎区域 */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nexus-primary/20 to-nexus-secondary/20 border border-nexus-primary/30 flex items-center justify-center mb-5">
                <Sparkles size={28} className="text-nexus-primary" />
              </div>
              <h2 className="text-lg font-bold text-nexus-text mb-4">
                JSON 提示词大师
              </h2>
              {/* NOTE: 使用与 Coze 智能体同步的开场白 */}
              <div className="max-w-lg mb-8 text-center">
                <p className="text-xs text-nexus-muted leading-relaxed whitespace-pre-line">
                  {WELCOME_MESSAGE}
                </p>
              </div>

              {/* 预设快速提问 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-2xl">
                {PRESET_QUESTIONS.map((q, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    onClick={() => handleSend(q.text)}
                    className="cursor-target bg-nexus-surface/60 border border-nexus-border rounded-xl p-4 text-left hover:border-nexus-primary/30 hover:bg-nexus-surface transition-all group"
                  >
                    <div className="text-lg mb-2">{q.icon}</div>
                    <h4 className="text-xs font-bold text-nexus-text group-hover:text-nexus-primary transition-colors mb-1">
                      {q.title}
                    </h4>
                    <p className="text-[10px] text-nexus-muted leading-relaxed line-clamp-2">
                      {q.text}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* 消息列表 */}
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nexus-primary/20 to-nexus-secondary/20 border border-nexus-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={16} className="text-nexus-primary" />
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-nexus-primary/15 border border-nexus-primary/20 text-nexus-text'
                    : 'bg-nexus-surface/70 border border-nexus-border text-nexus-text'
                }`}
              >
                {msg.role === 'user' ? (
                  <div>
                    {/* 用户消息附带的图片预览 */}
                    {msg.imagePreview && (
                      <div className="mb-2">
                        <img
                          src={msg.imagePreview}
                          alt="附带图片"
                          className="max-w-[200px] max-h-[150px] rounded-lg border border-nexus-primary/20 object-cover"
                        />
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ) : (
                  <div className="markdown-body text-sm leading-relaxed">
                    <ReactMarkdown
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        code: CodeBlock as any,
                        pre: ({ children }) => <pre className="bg-nexus-bg rounded-xl p-4 overflow-x-auto my-3 border border-nexus-border">{children}</pre>,
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 text-nexus-primary">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 text-nexus-primary">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold mb-1.5 mt-2 text-nexus-primary/80">{children}</h3>,
                        strong: ({ children }) => <strong className="font-bold text-nexus-text">{children}</strong>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-nexus-primary/40 pl-3 my-2 text-nexus-muted italic">
                            {children}
                          </blockquote>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3">
                            <table className="w-full border-collapse text-xs">{children}</table>
                          </div>
                        ),
                        th: ({ children }) => <th className="border border-nexus-border px-3 py-1.5 bg-nexus-surface text-left font-bold">{children}</th>,
                        td: ({ children }) => <td className="border border-nexus-border px-3 py-1.5">{children}</td>,
                      }}
                    >
                      {msg.content || ' '}
                    </ReactMarkdown>
                    {/* 流式接收中的光标动画 */}
                    {msg.streaming && (
                      <span className="inline-block w-2 h-4 bg-nexus-primary rounded-sm animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-nexus-surface border border-nexus-border flex items-center justify-center shrink-0 mt-0.5">
                  <User size={16} className="text-nexus-muted" />
                </div>
              )}
            </motion.div>
          ))}

          {/* 加载指示器（等待首个 token） */}
          {isStreaming && messages.length > 0 && messages[messages.length - 1]?.content === '' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-nexus-muted pl-11"
            >
              <Loader2 size={12} className="animate-spin text-nexus-primary" />
              <span>AI 正在思考...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── 输入区 ────────────────────────────────────────── */}
        <div className="px-4 pb-4 pt-2">
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* 快捷技能按钮栏 */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => {
                setInputText('帮我将下面这段描述一键标准化成专业的 JSON 提示词：\n\n');
                // NOTE: 预填后自动聚焦输入框，光标移到末尾，方便用户继续输入
                setTimeout(() => {
                  if (inputRef.current) {
                    inputRef.current.focus();
                    inputRef.current.style.height = 'auto';
                    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 128)}px`;
                  }
                }, 50);
              }}
              disabled={isStreaming}
              className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nexus-primary/8 border border-nexus-primary/15 text-[10px] text-nexus-primary hover:bg-nexus-primary/15 hover:border-nexus-primary/30 transition-all disabled:opacity-40"
            >
              <Zap size={11} />
              一键标准
            </button>
            <button
              onClick={handleQuickReverse}
              disabled={isStreaming}
              className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nexus-primary/8 border border-nexus-primary/15 text-[10px] text-nexus-primary hover:bg-nexus-primary/15 hover:border-nexus-primary/30 transition-all disabled:opacity-40"
            >
              <Zap size={11} />
              一键反推
            </button>
          </div>

          {/* 图片预览条（已附加图片时显示） */}
          <AnimatePresence>
            {attachedImagePreview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2"
              >
                <div className="flex items-center gap-2 bg-nexus-surface/80 border border-nexus-border rounded-xl px-3 py-2">
                  <img
                    src={attachedImagePreview}
                    alt="预览"
                    className="w-12 h-12 rounded-lg object-cover border border-nexus-primary/20"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-nexus-text truncate">
                      {attachedImage?.name}
                    </p>
                    <p className="text-[9px] text-nexus-muted">
                      {isUploadingImage ? (
                        <span className="flex items-center gap-1">
                          <Loader2 size={9} className="animate-spin" />
                          上传中...
                        </span>
                      ) : imageFileId ? (
                        <span className="text-nexus-primary">✓ 已上传</span>
                      ) : (
                        '准备中...'
                      )}
                    </p>
                  </div>
                  <button
                    onClick={clearAttachedImage}
                    className="cursor-target p-1 rounded text-nexus-muted hover:text-nexus-text hover:bg-nexus-border transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 输入框 */}
          <div className="bg-nexus-surface/60 border border-nexus-border rounded-2xl p-3 focus-within:border-nexus-primary/40 transition-all">
            <div className="flex items-end gap-2">
              {/* 图片上传按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isUploadingImage}
                className="cursor-target w-9 h-9 rounded-xl bg-transparent text-nexus-muted flex items-center justify-center hover:text-nexus-primary hover:bg-nexus-primary/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                title="上传图片（用于一键反推等）"
              >
                <ImagePlus size={16} />
              </button>
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? '请等待当前对话完成...' : '输入消息，与 JSON 提示词大师对话...'}
                rows={1}
                disabled={isStreaming}
                className="cursor-target flex-1 bg-transparent text-sm text-nexus-text placeholder-nexus-muted/50 outline-none resize-none max-h-32 min-h-[36px]"
                style={{
                  height: 'auto',
                  overflowY: inputText.split('\n').length > 4 ? 'auto' : 'hidden',
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isStreaming || (!inputText.trim() && !imageFileId)}
                className="cursor-target w-9 h-9 rounded-xl bg-nexus-primary text-nexus-inverse flex items-center justify-center hover:bg-nexus-primary/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
              >
                {isStreaming ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            <p className="text-[10px] text-nexus-muted/50 mt-2 pl-1">
              Enter 发送 · Shift + Enter 换行 · 支持上传图片反推提示词
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
