import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 公告管理面板
 * NOTE: 所有数据通过 REST API 从 PostgreSQL 读写，不再依赖 localStorage
 *
 * 后端数据结构映射：
 *   title   → 公告标题（含版本号前缀）
 *   content → 更新内容（换行分隔的条目列表）
 *   type    → 公告类型（update / maintenance / info）
 *   enabled → 是否已发布
 */

/** 后端 AnnouncementResponse 对应的前端类型 */
interface Announcement {
  id: number;
  title: string;
  content: string;
  type: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 公告类型选项 */
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'update', label: '版本更新' },
  { value: 'maintenance', label: '维护通知' },
  { value: 'info', label: '一般公告' },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export default function AnnouncementManagement() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);

  // 表单弹窗状态
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 表单字段
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState('update');
  const [formEnabled, setFormEnabled] = useState(false);

  /** 从后端加载公告列表 */
  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<Announcement[]>('/api/admin/announcements');
      // NOTE: 按 sortOrder 降序 → createdAt 降序排列
      const sorted = (data || []).sort((a, b) => {
        if (b.sortOrder !== a.sortOrder) return b.sortOrder - a.sortOrder;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setAnnouncements(sorted);
    } catch (err) {
      console.error('Failed to load announcements:', err);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  /** 开始新建 */
  const handleStartCreate = () => {
    setFormTitle('');
    setFormContent('');
    setFormType('update');
    setFormEnabled(false);
    setEditingItem(null);
    setIsCreating(true);
  };

  /** 开始编辑 */
  const handleStartEdit = (item: Announcement) => {
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormType(item.type);
    setFormEnabled(item.enabled);
    setEditingItem(item);
    setIsCreating(true);
  };

  /** 提交表单（新建或编辑） */
  const handleSubmit = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);

    try {
      if (editingItem) {
        await apiClient.put(`/api/admin/announcements/${editingItem.id}`, {
          title: formTitle,
          content: formContent,
          type: formType,
          enabled: formEnabled,
        });
      } else {
        await apiClient.post('/api/admin/announcements', {
          title: formTitle,
          content: formContent,
          type: formType,
          enabled: formEnabled,
        });
      }
      setIsCreating(false);
      setEditingItem(null);
      await loadAnnouncements();
    } catch (err) {
      console.error('Failed to save announcement:', err);
    } finally {
      setSubmitting(false);
    }
  };

  /** 发布/撤回 */
  const handleToggleEnabled = async (item: Announcement) => {
    try {
      await apiClient.put(`/api/admin/announcements/${item.id}`, {
        enabled: !item.enabled,
      });
      await loadAnnouncements();
    } catch (err) {
      console.error('Failed to toggle announcement:', err);
    }
  };

  /** 删除 */
  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/api/admin/announcements/${id}`);
      setDeleteTarget(null);
      await loadAnnouncements();
    } catch (err) {
      console.error('Failed to delete announcement:', err);
    }
  };

  /** 格式化日期 */
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  /** 将 content 按换行拆分为条目列表 */
  const contentToItems = (content: string): string[] =>
    content
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

  return (
    <div className="h-full overflow-y-auto p-8 space-y-6">
      {/* 页面标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
            <Megaphone size={22} className="text-amber-400" />
            公告管理
          </h1>
          <p className="text-sm text-nexus-muted mt-1.5">
            管理发布系统公告，更新内容会展示在工作台通知弹窗中。
          </p>
        </div>
        <button
          onClick={handleStartCreate}
          className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-600 transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]"
        >
          <Plus size={14} />
          新建公告
        </button>
      </motion.div>

      {/* 加载状态 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-amber-400" />
          <span className="ml-3 text-sm text-nexus-muted">加载中…</span>
        </div>
      ) : (
        /* 公告列表 */
        <div className="space-y-4">
          {announcements.map((a, index) => {
            const items = contentToItems(a.content);
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className={`bg-nexus-surface border rounded-2xl p-6 transition-all ${
                  a.enabled
                    ? 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                    : 'border-nexus-border'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                        a.type === 'update'
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          : a.type === 'maintenance'
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                            : 'bg-nexus-surface-alt text-nexus-muted border-nexus-border'
                      }`}
                    >
                      {TYPE_LABELS[a.type] || a.type}
                    </span>
                    <span className="text-[11px] text-nexus-muted font-mono">
                      {formatDate(a.createdAt)}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                        a.enabled
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-nexus-surface-alt text-nexus-muted border-nexus-border'
                      }`}
                    >
                      {a.enabled ? '已发布' : '草稿'}
                    </span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleEnabled(a)}
                      className={`p-1.5 rounded-lg transition-all ${
                        a.enabled
                          ? 'text-nexus-muted hover:text-amber-400 hover:bg-amber-500/10'
                          : 'text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      title={a.enabled ? '撤回' : '发布'}
                    >
                      {a.enabled ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      onClick={() => handleStartEdit(a)}
                      className="p-1.5 rounded-lg text-nexus-muted hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                      title="编辑"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(a)}
                      className="p-1.5 rounded-lg text-nexus-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="删除"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-nexus-text mb-3">{a.title}</h3>
                {items.length > 0 && (
                  <ul className="space-y-1.5">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-nexus-muted">
                        <span className="text-amber-400 mt-0.5">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            );
          })}

          {announcements.length === 0 && (
            <div className="text-center py-16 text-nexus-muted text-sm">
              暂无公告，点击"新建公告"创建第一条。
            </div>
          )}
        </div>
      )}

      {/* 新建/编辑弹窗 */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              setIsCreating(false);
              setEditingItem(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl max-w-lg w-full shadow-2xl shadow-black/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-nexus-border bg-nexus-surface-alt/30">
                <Megaphone size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-nexus-text">
                  {editingItem ? '编辑公告' : '新建公告'}
                </h3>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setEditingItem(null);
                  }}
                  className="ml-auto p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-nexus-muted uppercase tracking-wider mb-2">
                      公告类型
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-3 py-2.5 text-sm text-nexus-text focus:outline-none focus:border-amber-500/50 transition-all"
                    >
                      {TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formEnabled}
                        onChange={(e) => setFormEnabled(e.target.checked)}
                        className="accent-amber-500 w-4 h-4"
                      />
                      <span className="text-xs text-nexus-muted">创建后立即发布</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-nexus-muted uppercase tracking-wider mb-2">
                    公告标题
                  </label>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="如 🚀 KunLun 昆仑工坊 v2.7.0 版本更新"
                    className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-3 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-nexus-muted uppercase tracking-wider mb-2">
                    更新内容{' '}
                    <span className="text-nexus-muted/50 normal-case">（每行一条）</span>
                  </label>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="每行一条更新内容..."
                    rows={5}
                    className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-3 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-nexus-border flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setEditingItem(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!formTitle.trim() || submitting}
                  className="px-5 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingItem ? '保存修改' : '创建公告'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认弹窗 */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl max-w-sm w-full shadow-2xl shadow-black/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-6 py-4 border-b border-nexus-border bg-nexus-surface-alt/30">
                <AlertTriangle size={18} className="text-rose-400" />
                <h3 className="text-sm font-bold text-nexus-text">删除公告</h3>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-nexus-text">
                  确定删除公告{' '}
                  <span className="font-bold text-amber-400">
                    {deleteTarget.title}
                  </span>{' '}
                  吗？此操作不可撤销。
                </p>
              </div>
              <div className="px-6 py-4 border-t border-nexus-border flex items-center justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDelete(deleteTarget.id)}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all"
                >
                  删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
