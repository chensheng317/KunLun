import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Shield,
  Crown,
  Star,
  Zap,
  User,
  Ban,
  CheckCircle,
  AlertTriangle,
  X,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';
import { ROLE_LABELS } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 用户管理面板
 * NOTE: 通过后端 API 管理用户数据
 * 超级管理员可操作所有用户；普通管理员不能修改超级管理员和管理员角色
 */

const PAGE_SIZE = 8;

// --- 后端 API 响应类型定义 ---

/** 用户条目（对应后端 UserDetailResponse） */
interface UserItem {
  id: number;
  username: string;
  role: UserRole;
  credits: number;
  disabled: boolean;
  createdAt: string;
  updatedAt?: string;
  membershipExpiry?: string | null;
  lastHeartbeat?: string | null;
}

/** 用户列表分页响应 */
interface UserListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: UserItem[];
}

/** 角色排序权重 — 用于列表排序 */
const ROLE_WEIGHT: Record<UserRole, number> = {
  super_admin: 6,
  admin: 5,
  ultra: 4,
  pro: 3,
  normal: 2,
  guest: 1,
};

/** 角色图标映射 */
const ROLE_ICONS: Record<UserRole, typeof Shield> = {
  super_admin: Shield,
  admin: Crown,
  ultra: Star,
  pro: Zap,
  normal: User,
  guest: User,
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

/** 所有角色列表 — 用于筛选按钮展示 */
const ALL_ROLES: UserRole[] = ['super_admin', 'admin', 'ultra', 'pro', 'normal', 'guest'];

/**
 * 根据当前操作者权限返回可分配的角色列表
 * NOTE: 超级管理员全局唯一，任何人都不能将其他用户设为超级管理员
 * 超级管理员可以分配 admin 及以下角色
 * 普通管理员只能分配用户级角色（normal/pro/ultra/guest）
 */
function getAssignableRoles(operatorIsSuperAdmin: boolean): UserRole[] {
  if (operatorIsSuperAdmin) return ['admin', 'ultra', 'pro', 'normal', 'guest'];
  return ['ultra', 'pro', 'normal', 'guest'];
}

export default function UserManagement() {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // 确认弹窗
  const [confirmAction, setConfirmAction] = useState<{
    type: 'toggle' | 'role_change';
    userId: number;
    username: string;
    message: string;
    /** 角色变更时存储目标角色 */
    newRole?: UserRole;
  } | null>(null);

  /**
   * 从后端 API 加载用户列表
   * NOTE: 获取全部用户并在前端排序/筛选，与原有交互一致
   */
  const loadUsers = useCallback(async () => {
    try {
      const data = await apiClient.get<UserListResponse>('/api/users?page=1&pageSize=1000');
      // 按角色权重降序 → 按注册时间降序
      const sorted = [...data.items].sort((a, b) => {
        const roleDiff = (ROLE_WEIGHT[b.role] || 0) - (ROLE_WEIGHT[a.role] || 0);
        if (roleDiff !== 0) return roleDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setUsers(sorted);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /**
   * 弹窗确认角色变更
   * NOTE: 不直接修改，先弹出确认弹窗，确认后才执行 API 调用
   * 提拔为管理员时需额外提醒：积分将被销毁，调度记录和会员时长将被清除
   */
  const promptRoleChange = useCallback((userId: number, username: string, oldRole: UserRole, newRole: UserRole) => {
    if (oldRole === newRole) return;

    // NOTE: 提拔为 admin 时，积分系统全部清理（由后端处理）
    const isPromotingToAdmin = newRole === 'admin';
    const warningText = isPromotingToAdmin
      ? '\n\n⚠️ 管理员不使用积分系统，该用户的积分余额、积分调度记录、会员到期时间将会被清除。'
      : '\n\n变更后该用户的积分余额不会受到影响，但权限将立即生效。';

    setConfirmAction({
      type: 'role_change',
      userId,
      username,
      message: `确定将用户 "${username}" 的角色从「${ROLE_LABELS[oldRole]}」变更为「${ROLE_LABELS[newRole]}」吗？${warningText}`,
      newRole,
    });
  }, []);

  /**
   * 执行角色变更（确认弹窗回调）
   * NOTE: 调用 PUT /api/users/{userId} 更新角色
   */
  const executeRoleChange = useCallback(async (userId: number, newRole: UserRole) => {
    setActionLoading(true);
    try {
      await apiClient.put(`/api/users/${userId}`, { role: newRole });
      // 刷新列表
      await loadUsers();
    } catch (err) {
      console.error('Failed to change role:', err);
      alert(err instanceof Error ? err.message : '角色变更失败');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }, [loadUsers]);

  /**
   * 禁用/启用用户
   * NOTE: 调用 PUT /api/users/{userId} 切换 disabled 状态
   */
  const handleToggleDisabled = useCallback(async (userId: number) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;

    setActionLoading(true);
    try {
      await apiClient.put(`/api/users/${userId}`, { disabled: !target.disabled });
      await loadUsers();
    } catch (err) {
      console.error('Failed to toggle user status:', err);
      alert(err instanceof Error ? err.message : '操作失败');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }, [users, loadUsers]);

  // 过滤 + 搜索
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (searchQuery && !u.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paged = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter]);

  /** 格式化日期 */
  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  /**
   * 判断当前管理员是否可以操作目标用户
   * NOTE: 普通管理员不能修改超级管理员和其他管理员
   */
  const canEditUser = (target: UserItem): boolean => {
    if (isSuperAdmin) return true;
    return target.role !== 'super_admin' && target.role !== 'admin';
  };

  /** 生成分页按钮 */
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  // 加载状态
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="text-amber-400 animate-spin" />
          <p className="text-sm text-nexus-muted">加载用户数据…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 space-y-6">
      {/* 页面标题 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <Users size={22} className="text-amber-400" />
          用户管理
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          管理平台注册用户，分配角色与权限。
        </p>
      </motion.div>

      {/* 搜索 + 筛选栏 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap items-center gap-4"
      >
        {/* 搜索框 */}
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

        {/* 角色筛选 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
              roleFilter === 'all'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'text-nexus-muted border-nexus-border hover:text-nexus-text hover:border-nexus-border'
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
                  : 'text-nexus-muted border-nexus-border hover:text-nexus-text hover:border-nexus-border'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {/* 用户数统计 */}
        <span className="text-xs text-nexus-muted font-mono ml-auto">
          共 {filteredUsers.length} 位用户
        </span>
      </motion.div>

      {/* 用户表格 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden"
      >
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                用户名
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                角色
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                状态
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">
                注册时间
              </th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {paged.map((u) => {
              const Icon = ROLE_ICONS[u.role] || User;
              const badgeColor = ROLE_BADGE_COLORS[u.role] || ROLE_BADGE_COLORS.normal;
              const editable = canEditUser(u);
              const isSelf = u.username === currentUser?.username;

              return (
                <tr
                  key={u.id}
                  className={`hover:bg-nexus-bg/50 transition-colors ${u.disabled ? 'opacity-50' : ''}`}
                >
                  {/* 用户名 */}
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border font-bold text-xs ${badgeColor}`}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-nexus-text font-medium">
                          {u.username}
                          {isSelf && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-nexus-primary/20 text-nexus-primary border border-nexus-primary/30">
                              当前
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* 角色 — 可编辑下拉 */}
                  <td className="p-4">
                    {editable && !isSelf ? (
                      <select
                        value={u.role}
                        onChange={(e) => promptRoleChange(u.id, u.username, u.role, e.target.value as UserRole)}
                        className="bg-nexus-bg border border-nexus-border rounded-lg px-2 py-1.5 text-xs text-nexus-text focus:outline-none focus:border-amber-500/50 transition-all cursor-pointer"
                      >
                        {getAssignableRoles(isSuperAdmin).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${badgeColor}`}>
                        <Icon size={10} />
                        {ROLE_LABELS[u.role]}
                      </span>
                    )}
                  </td>

                  {/* 状态 */}
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${
                      u.disabled
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {u.disabled ? '已禁用' : '正常'}
                    </span>
                  </td>

                  {/* 注册时间 */}
                  <td className="p-4 text-xs text-nexus-muted font-mono">
                    {formatDate(u.createdAt)}
                  </td>

                  {/* 操作 */}
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* 禁用/启用 — 不能操作自己 */}
                      {editable && !isSelf && (
                        <button
                          onClick={() =>
                            setConfirmAction({
                              type: 'toggle',
                              userId: u.id,
                              username: u.username,
                              message: u.disabled
                                ? `确定启用用户 "${u.username}" 吗？`
                                : `确定禁用用户 "${u.username}" 吗？禁用后该用户将无法登录。`,
                            })
                          }
                          className={`p-1.5 rounded-lg transition-all ${
                            u.disabled
                              ? 'text-emerald-400 hover:bg-emerald-500/10'
                              : 'text-nexus-muted hover:text-amber-400 hover:bg-amber-500/10'
                          }`}
                          title={u.disabled ? '启用' : '禁用'}
                        >
                          {u.disabled ? <CheckCircle size={15} /> : <Ban size={15} />}
                        </button>
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

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
            <span className="text-[11px] text-nexus-muted font-mono">
              共 {filteredUsers.length} 条 · 第 {currentPage}/{totalPages} 页
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

      {/* 确认弹窗 */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmAction(null)}
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
                <AlertTriangle size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-nexus-text">操作确认</h3>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="ml-auto p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-nexus-text leading-relaxed">{confirmAction.message}</p>
              </div>
              <div className="px-6 py-4 border-t border-nexus-border flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg text-sm text-nexus-muted hover:text-nexus-text transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (confirmAction.type === 'role_change' && confirmAction.newRole) {
                      executeRoleChange(confirmAction.userId, confirmAction.newRole);
                    } else {
                      handleToggleDisabled(confirmAction.userId);
                    }
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg text-sm font-bold transition-all bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {actionLoading ? '处理中…' : '确认'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
