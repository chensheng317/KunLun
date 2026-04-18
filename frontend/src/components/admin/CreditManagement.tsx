import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Minus,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Wallet,
  X,
  Shield,
  Crown,
  Star,
  Zap,
  User,
  Eye,
  History,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 积分管理面板
 * NOTE: 所有数据通过 REST API 从 PostgreSQL 读写，不再依赖 localStorage
 * 支持对用户积分的增减、重置、分页、搜索、角色筛选
 */

type UserRole = 'super_admin' | 'admin' | 'ultra' | 'pro' | 'normal' | 'guest';

const PAGE_SIZE = 8;

/** 角色中文标签 */
const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  ultra: '旗舰版',
  pro: '专业版',
  normal: '普通用户',
  guest: '游客',
};

/** 角色初始积分（用于重置操作） */
const ROLE_INITIAL_CREDITS: Record<UserRole, number> = {
  super_admin: 999999,
  admin: 999999,
  ultra: 5000,
  pro: 2000,
  normal: 500,
  guest: 100,
};

/** 角色排序权重 */
const ROLE_WEIGHT: Record<UserRole, number> = {
  super_admin: 6, admin: 5, ultra: 4, pro: 3, normal: 2, guest: 1,
};

/** 角色颜色映射 */
const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  admin: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ultra: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  pro: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  normal: 'bg-nexus-surface-alt text-nexus-muted border-nexus-border',
  guest: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

/** 角色图标映射 */
const ROLE_ICONS: Record<UserRole, typeof Shield> = {
  super_admin: Shield, admin: Crown, ultra: Star, pro: Zap, normal: User, guest: Eye,
};

const ALL_ROLES: UserRole[] = ['super_admin', 'admin', 'ultra', 'pro', 'normal', 'guest'];

/** 用户积分条目（来自 API 的 UserDetailResponse） */
interface UserCreditEntry {
  id: number;
  username: string;
  role: UserRole;
  credits: number;
  disabled: boolean;
}

/** 积分操作弹窗类型 */
type CreditActionType = 'add' | 'deduct' | 'reset';

export default function CreditManagement() {
  const { isSuperAdmin } = useAuth();
  const [entries, setEntries] = useState<UserCreditEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // 积分操作弹窗状态
  const [actionModal, setActionModal] = useState<{
    type: CreditActionType;
    userId: number;
    username: string;
    currentCredits: number;
    role: UserRole;
  } | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionRemark, setActionRemark] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // 统计卡片数据
  const [stats, setStats] = useState({ totalCredits: 0, todayConsumed: 0, totalIssued: 0 });

  // 日志面板
  const [showLogs, setShowLogs] = useState(false);

  /**
   * 加载用户积分列表
   * NOTE: 一次性获取大量用户并在前端排序/过滤，适合中小规模用户量
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 并行请求用户列表和统计概览
      const [usersRes, overviewRes] = await Promise.all([
        apiClient.get<{ total: number; items: UserCreditEntry[] }>(
          '/api/users?page=1&pageSize=200',
        ),
        apiClient.get<{
          totalCreditsConsumed: number;
          todayCreditsConsumed: number;
          todayToolCalls: number;
        }>('/api/admin/overview'),
      ]);

      const list = (usersRes.items || []).map((u) => ({
        ...u,
        role: (u.role || 'guest') as UserRole,
      }));

      // 排序：按角色权重降序 → 积分降序
      list.sort((a, b) => {
        const roleDiff = (ROLE_WEIGHT[b.role] || 0) - (ROLE_WEIGHT[a.role] || 0);
        if (roleDiff !== 0) return roleDiff;
        return b.credits - a.credits;
      });
      setEntries(list);

      // 统计数据
      const totalCredits = list.reduce(
        (sum, e) => sum + Math.max(0, e.credits),
        0,
      );
      setStats({
        totalCredits,
        todayConsumed: overviewRes.todayCreditsConsumed || 0,
        // NOTE: totalIssued 暂用今日消费的反向数据；后续可增加专用统计端点
        totalIssued: overviewRes.todayToolCalls || 0,
      });
    } catch (err) {
      console.error('Failed to load credit data:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 过滤 + 搜索
  const filteredEntries = entries.filter((e) => {
    if (roleFilter !== 'all' && e.role !== roleFilter) return false;
    if (searchQuery && !e.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const paged = filteredEntries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, roleFilter]);

  /**
   * 执行积分操作
   * NOTE: 通过 /api/credits/adjust 接口提交，正数=增加，负数=扣减
   */
  const executeAction = useCallback(async () => {
    if (!actionModal) return;
    const { type, userId, username, currentCredits, role } = actionModal;
    setActionLoading(true);

    try {
      if (type === 'add') {
        const amt = parseInt(actionAmount, 10);
        if (isNaN(amt) || amt <= 0) return;
        await apiClient.post('/api/credits/adjust', {
          userId,
          amount: amt,
          description: `管理员手动增加 ${amt} 积分${actionRemark ? `，备注：${actionRemark}` : ''}`,
        });
      } else if (type === 'deduct') {
        const amt = parseInt(actionAmount, 10);
        if (isNaN(amt) || amt <= 0) return;
        await apiClient.post('/api/credits/adjust', {
          userId,
          amount: -amt,
          description: `管理员手动扣减 ${amt} 积分${actionRemark ? `，备注：${actionRemark}` : ''}`,
        });
      } else if (type === 'reset') {
        const resetTarget = ROLE_INITIAL_CREDITS[role] ?? 0;
        const diff = resetTarget - (currentCredits < 0 ? 0 : currentCredits);
        if (diff !== 0) {
          await apiClient.post('/api/credits/adjust', {
            userId,
            amount: diff,
            description: `管理员重置 ${username} 积分为 ${role} 初始值 ${resetTarget}`,
          });
        }
      }

      setActionModal(null);
      setActionAmount('');
      setActionRemark('');
      // 重新加载数据
      await loadData();
    } catch (err) {
      console.error('Failed to adjust credits:', err);
    } finally {
      setActionLoading(false);
    }
  }, [actionModal, actionAmount, actionRemark, loadData]);

  /** 分页按钮 */
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  /** 判断是否可操作目标用户积分 */
  const canEdit = (target: UserCreditEntry): boolean => {
    if (isSuperAdmin) return true;
    return target.role !== 'super_admin' && target.role !== 'admin';
  };

  const statCards = [
    { title: '全平台积分余额', value: stats.totalCredits.toLocaleString(), icon: Wallet, color: 'text-nexus-primary', bgColor: 'bg-nexus-primary/10', borderColor: 'border-nexus-primary/20' },
    { title: '今日积分消费', value: stats.todayConsumed.toLocaleString(), icon: TrendingDown, color: 'text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/20' },
    { title: '今日工具调用', value: stats.totalIssued.toLocaleString(), icon: TrendingUp, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  ];

  return (
    <div className="h-full overflow-y-auto p-8 space-y-6">
      {/* 页面标题 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
              <Coins size={22} className="text-amber-400" />
              积分管理
            </h1>
            <p className="text-sm text-nexus-muted mt-1.5">
              管理全平台用户积分，支持增减、重置和流水查看。
            </p>
          </div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              showLogs
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'text-nexus-muted border-nexus-border hover:text-nexus-text'
            }`}
          >
            <History size={14} />
            操作日志
          </button>
        </div>
      </motion.div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className={`bg-nexus-surface border ${card.borderColor} rounded-2xl p-5 relative overflow-hidden group hover:border-nexus-border transition-all duration-300`}
            >
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-xs text-nexus-muted mb-1 font-medium">{card.title}</p>
                  <p className={`text-2xl font-black ${card.color} font-mono`}>{card.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                  <Icon size={20} className={card.color} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 搜索 + 筛选 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap items-center gap-4"
      >
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-nexus-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索用户名…"
            className="w-full bg-nexus-bg border border-nexus-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.1)] transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
              roleFilter === 'all'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'text-nexus-muted border-nexus-border hover:text-nexus-text'
            }`}
          >
            全部
          </button>
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                roleFilter === role
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'text-nexus-muted border-nexus-border hover:text-nexus-text'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        <span className="text-xs text-nexus-muted font-mono ml-auto">
          共 {filteredEntries.length} 位用户
        </span>
      </motion.div>

      {/* 积分列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-amber-400" />
            <span className="ml-3 text-sm text-nexus-muted">加载中…</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">用户名</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">角色</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">积分余额</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">状态</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexus-border">
              {paged.map((entry) => {
                const Icon = ROLE_ICONS[entry.role] || User;
                const badgeColor = ROLE_BADGE_COLORS[entry.role] || ROLE_BADGE_COLORS.guest;
                const editable = canEdit(entry);
                const displayCredits = Math.max(0, entry.credits);

                return (
                  <tr key={entry.id} className={`hover:bg-nexus-bg/50 transition-colors ${entry.disabled ? 'opacity-50' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border font-bold text-xs ${badgeColor}`}>
                          {entry.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-nexus-text font-medium">{entry.username}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${badgeColor}`}>
                        <Icon size={10} />
                        {ROLE_LABELS[entry.role]}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-sm font-mono font-bold ${displayCredits > 0 ? 'text-nexus-primary' : displayCredits === 0 ? 'text-nexus-muted' : 'text-rose-400'}`}>
                        {displayCredits.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${
                        entry.disabled
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {entry.disabled ? '已禁用' : '正常'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {editable && (
                          <>
                            <button
                              onClick={() => setActionModal({ type: 'add', userId: entry.id, username: entry.username, currentCredits: displayCredits, role: entry.role })}
                              className="p-1.5 rounded-lg text-nexus-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                              title="增加积分"
                            >
                              <Plus size={15} />
                            </button>
                            <button
                              onClick={() => setActionModal({ type: 'deduct', userId: entry.id, username: entry.username, currentCredits: displayCredits, role: entry.role })}
                              className="p-1.5 rounded-lg text-nexus-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                              title="扣减积分"
                            >
                              <Minus size={15} />
                            </button>
                            <button
                              onClick={() => setActionModal({ type: 'reset', userId: entry.id, username: entry.username, currentCredits: displayCredits, role: entry.role })}
                              className="p-1.5 rounded-lg text-nexus-muted hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                              title="重置积分"
                            >
                              <RotateCcw size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paged.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-nexus-muted text-sm">
                    暂无匹配的用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
            <span className="text-[11px] text-nexus-muted font-mono">
              共 {filteredEntries.length} 条 · 第 {currentPage}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft size={16} />
              </button>
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>
              {getPageNumbers().map((page, idx) =>
                page === '...' ? (
                  <span key={`dots-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-nexus-muted">…</span>
                ) : (
                  <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 rounded-md text-xs font-bold transition-all ${
                    page === currentPage
                      ? 'bg-amber-500 text-nexus-inverse shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'
                  }`}>{page}</button>
                ),
              )}
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded-md text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* 操作日志面板 — 最近积分变动记录 */}
      <AnimatePresence>
        {showLogs && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <RecentCreditLogs />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 积分操作弹窗 */}
      <AnimatePresence>
        {actionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setActionModal(null)}
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
                {actionModal.type === 'add' && <Plus size={18} className="text-emerald-400" />}
                {actionModal.type === 'deduct' && <Minus size={18} className="text-rose-400" />}
                {actionModal.type === 'reset' && <RotateCcw size={18} className="text-amber-400" />}
                <h3 className="text-sm font-bold text-nexus-text">
                  {actionModal.type === 'add' && '增加积分'}
                  {actionModal.type === 'deduct' && '扣减积分'}
                  {actionModal.type === 'reset' && '重置积分'}
                </h3>
                <button
                  onClick={() => setActionModal(null)}
                  className="ml-auto p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="text-sm text-nexus-muted">
                  用户：<span className="text-nexus-text font-medium">{actionModal.username}</span>
                  <span className="ml-2">当前积分：<span className="font-mono text-nexus-primary">{actionModal.currentCredits.toLocaleString()}</span></span>
                </div>

                {actionModal.type === 'reset' ? (
                  <p className="text-sm text-nexus-text">
                    将积分重置为 <span className="text-nexus-primary font-bold">{ROLE_LABELS[actionModal.role]}</span> 的初始值：
                    <span className="font-mono text-amber-400 ml-1">{(ROLE_INITIAL_CREDITS[actionModal.role] ?? 0).toLocaleString()}</span> 积分
                  </p>
                ) : (
                  <>
                    <input
                      type="number"
                      min={1}
                      value={actionAmount}
                      onChange={(e) => setActionAmount(e.target.value)}
                      placeholder="输入积分数量"
                      className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 transition-all"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={actionRemark}
                      onChange={(e) => setActionRemark(e.target.value)}
                      placeholder="备注（可选）"
                      className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 transition-all"
                    />
                  </>
                )}
              </div>

              <div className="px-6 py-4 border-t border-nexus-border flex items-center justify-end gap-3">
                <button
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={executeAction}
                  disabled={actionLoading || (actionModal.type !== 'reset' && (!actionAmount || parseInt(actionAmount, 10) <= 0))}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${
                    actionModal.type === 'deduct'
                      ? 'bg-rose-500 text-white hover:bg-rose-600'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                >
                  {actionLoading && <Loader2 size={14} className="animate-spin" />}
                  确认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 最近积分变动日志（带分页）
 * NOTE: 从 /api/credits/records/all 接口获取全平台积分流水
 */
const LOG_PAGE_SIZE = 15;

interface CreditLogItem {
  id: number;
  userId: number;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  createdAt: string;
}

function RecentCreditLogs() {
  const [logs, setLogs] = useState<CreditLogItem[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const res = await apiClient.get<{
        total: number;
        items: CreditLogItem[];
      }>(`/api/credits/records/all?page=${page}&pageSize=${LOG_PAGE_SIZE}`);
      setLogs(res.items || []);
      setTotalLogs(res.total || 0);
    } catch (err) {
      console.error('Failed to load credit logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(logPage);
  }, [logPage, fetchLogs]);

  const totalLogPages = Math.max(1, Math.ceil(totalLogs / LOG_PAGE_SIZE));

  /** 积分类型标签 */
  const typeLabel = (type: string): string => {
    const map: Record<string, string> = {
      consume: '工具消费',
      recharge: '充值',
      refund: '退款',
      admin_add: '管理员增加',
      admin_deduct: '管理员扣减',
      upgrade: '升级赠送',
    };
    return map[type] || type;
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  };

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-nexus-text flex items-center gap-2">
          <History size={16} className="text-amber-400" />
          最近积分变动
        </h3>
        <span className="text-[10px] text-nexus-muted font-mono">
          共 {totalLogs} 条记录
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-amber-400" />
          <span className="ml-2 text-xs text-nexus-muted">加载中…</span>
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-nexus-muted text-center py-8">暂无积分变动记录</p>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg bg-nexus-bg/50 hover:bg-nexus-bg transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-nexus-text truncate">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-2 ${
                      log.amount > 0
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                    }`}>
                      {log.amount > 0 ? '+' : ''}{log.amount}
                    </span>
                    {typeLabel(log.type)}
                  </p>
                  <p className="text-[10px] text-nexus-muted truncate">{log.description || '-'}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-[10px] text-nexus-muted font-mono">{formatTime(log.createdAt)}</p>
                  <p className="text-[10px] text-nexus-muted font-mono">余额: {log.balance}</p>
                </div>
              </div>
            ))}
          </div>

          {totalLogPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-nexus-border">
              <span className="text-[10px] text-nexus-muted font-mono">
                第 {logPage}/{totalLogPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setLogPage(1)} disabled={logPage === 1} className="p-1 rounded text-nexus-muted hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronsLeft size={14} />
                </button>
                <button onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={logPage === 1} className="p-1 rounded text-nexus-muted hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] text-nexus-muted px-2 font-mono">{logPage}</span>
                <button onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))} disabled={logPage === totalLogPages} className="p-1 rounded text-nexus-muted hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={14} />
                </button>
                <button onClick={() => setLogPage(totalLogPages)} disabled={logPage === totalLogPages} className="p-1 rounded text-nexus-muted hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
