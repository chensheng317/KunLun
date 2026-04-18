import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  TrendingUp,
  DollarSign,
  RotateCcw,
  BarChart3,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  X,
  ArrowUpRight,
  Zap,
  Filter,
  Loader2,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../../contexts/AuthContext';
import type { UserRole, OrderStatus } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 订单管理面板
 *
 * NOTE: 所有数据通过后端 RESTful API 获取，彻底消除 localStorage 依赖
 *       支持按渠道（升级方案/直充）、状态筛选、用户搜索和数据统计
 */

/* ────────── 类型定义 ────────── */

/** 后端订单响应结构 */
interface ApiOrder {
  id: number;
  userId: number;
  username: string;
  type: 'upgrade' | 'recharge';
  amount: number;
  credits: number;
  targetRole: string | null;
  planName: string | null;
  hasFirstBonus: boolean;
  firstBonusCredits: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

/** 后端分页响应 */
interface OrderListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ApiOrder[];
}

/* ────────── 常量 ────────── */

const PAGE_SIZE = 8;

/** 订单状态配置 */
const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: '待处理', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  completed: { label: '已完成', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  refunded: { label: '已退款', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: RotateCcw },
  cancelled: { label: '已取消', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: XCircle },
};

/** 订单类型标签 */
const TYPE_LABELS: Record<string, string> = {
  upgrade: '升级方案',
  recharge: '积分直充',
};

export default function OrderManagement() {
  const { user: currentUser } = useAuth();

  /* ────────── 状态 ────────── */
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'upgrade' | 'recharge'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<ApiOrder | null>(null);

  /* ────────── 数据加载 ────────── */

  /**
   * 从后端 API 获取订单列表
   *
   * NOTE: 使用大 pageSize 一次拉取全量数据，便于前端做统计聚合
   *       后续数据量大时可切换为后端分页 + 单独统计接口
   */
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('pageSize', '100');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const data = await apiClient.get<OrderListResponse>(
        `/api/orders?${params.toString()}`
      );
      setOrders(data.items);
      setTotalOrders(data.total);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  /* ────────── 前端搜索过滤 ────────── */

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(
      (o) =>
        o.username.toLowerCase().includes(q) ||
        String(o.id).includes(q)
    );
  }, [orders, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const paged = filteredOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, typeFilter]);

  /* ────────── 统计数据 ────────── */

  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === 'completed');
    const refunded = orders.filter((o) => o.status === 'refunded');
    const totalAmount = completed.reduce((sum, o) => sum + Number(o.amount), 0);
    const refundedAmount = refunded.reduce((sum, o) => sum + Number(o.amount), 0);
    const refundRate = orders.length > 0 ? (refunded.length / orders.length) * 100 : 0;
    const avgOrderValue = completed.length > 0 ? totalAmount / completed.length : 0;

    // 按渠道统计
    const upgradeOrders = completed.filter((o) => o.type === 'upgrade');
    const rechargeOrders = completed.filter((o) => o.type === 'recharge');
    const upgradeAmount = upgradeOrders.reduce((sum, o) => sum + Number(o.amount), 0);
    const rechargeAmount = rechargeOrders.reduce((sum, o) => sum + Number(o.amount), 0);

    // NOTE: 按订单购买的目标角色统计，避免用户升级后旧订单被错误归类
    const userRoleStats: Record<string, { count: number; amount: number }> = {};
    completed.forEach((o) => {
      const role = o.targetRole || 'guest';
      if (!userRoleStats[role]) userRoleStats[role] = { count: 0, amount: 0 };
      userRoleStats[role].count++;
      userRoleStats[role].amount += Number(o.amount);
    });

    return {
      totalOrders: totalOrders,
      totalAmount,
      refundRate: refundRate.toFixed(1),
      avgOrderValue: avgOrderValue.toFixed(0),
      refundedAmount,
      upgradeCount: upgradeOrders.length,
      upgradeAmount,
      rechargeCount: rechargeOrders.length,
      rechargeAmount,
      userRoleStats,
    };
  }, [orders, totalOrders]);

  /* ────────── 操作 ────────── */

  /** 更新订单状态 */
  const handleStatusChange = useCallback(async (orderId: number, newStatus: OrderStatus) => {
    try {
      await apiClient.put(`/api/orders/${orderId}/status`, { status: newStatus });
      await loadOrders();
      setSelectedOrder(null);
    } catch (err) {
      console.error('Failed to update order status:', err);
      alert('状态更新失败，请重试');
    }
  }, [loadOrders]);

  /** 撤销退款 — 恢复为已完成状态 */
  const handleUndoRefund = useCallback(async (orderId: number) => {
    try {
      await apiClient.put(`/api/orders/${orderId}/status`, { status: 'completed' });
      await loadOrders();
      setSelectedOrder(null);
    } catch (err) {
      console.error('Failed to undo refund:', err);
      alert('撤销退款失败，请重试');
    }
  }, [loadOrders]);

  /** 删除订单 */
  const handleDeleteOrder = useCallback(async (orderId: number) => {
    if (!window.confirm('确定要删除这条订单吗？删除后无法恢复。')) return;
    try {
      await apiClient.delete(`/api/orders/${orderId}`);
      await loadOrders();
      setSelectedOrder(null);
    } catch (err) {
      console.error('Failed to delete order:', err);
      alert('删除失败，请重试');
    }
  }, [loadOrders]);

  /* ────────── 工具函数 ────────── */

  /** 格式化日期 */
  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  };

  /** 分页号码 */
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

  /* ────────── 顶部统计卡片 ────────── */

  const topCards = [
    { title: '总订单量', value: stats.totalOrders, icon: ShoppingCart, color: 'text-nexus-primary', bgColor: 'bg-nexus-primary/10', borderColor: 'border-nexus-primary/20' },
    { title: '成交总额', value: `¥${stats.totalAmount.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    { title: '退款率', value: `${stats.refundRate}%`, icon: RotateCcw, color: 'text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/20' },
    { title: '客单价', value: `¥${stats.avgOrderValue}`, icon: BarChart3, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  ];

  /* ────────── 渲染 ────────── */

  return (
    <div className="h-full overflow-y-auto p-8 space-y-6">
      {/* 页面标题 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <ShoppingCart size={22} className="text-amber-400" />
          订单管理
          {loading && <Loader2 size={16} className="animate-spin text-nexus-muted" />}
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          管理全平台订单，包含套餐升级和积分直充，支持状态操作与数据统计。
        </p>
      </motion.div>

      {/* 统计看板 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {topCards.map((card, idx) => {
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

      {/* 渠道 & 用户级别统计 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        {/* 渠道统计 */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
          <h3 className="text-sm font-bold text-nexus-text mb-4 flex items-center gap-2">
            <Filter size={15} className="text-nexus-primary" />
            渠道分布
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-nexus-bg/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                  <ArrowUpRight size={14} className="text-purple-400" />
                </div>
                <span className="text-sm text-nexus-text font-medium">升级方案</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-bold text-nexus-text">{stats.upgradeCount} 单</p>
                <p className="text-[10px] text-nexus-muted">¥{stats.upgradeAmount.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-nexus-bg/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <Zap size={14} className="text-blue-400" />
                </div>
                <span className="text-sm text-nexus-text font-medium">积分直充</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-bold text-nexus-text">{stats.rechargeCount} 单</p>
                <p className="text-[10px] text-nexus-muted">¥{stats.rechargeAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 用户级别统计 */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
          <h3 className="text-sm font-bold text-nexus-text mb-4 flex items-center gap-2">
            <BarChart3 size={15} className="text-nexus-primary" />
            用户级别分布
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.userRoleStats).length === 0 ? (
              <p className="text-xs text-nexus-muted text-center py-6">暂无订单数据</p>
            ) : (
              Object.entries(stats.userRoleStats)
                .sort(([, a], [, b]) => b.amount - a.amount)
                .map(([role, data]) => {
                  const maxAmount = Math.max(...Object.values(stats.userRoleStats).map((d) => d.amount), 1);
                  const percentage = (data.amount / maxAmount) * 100;
                  return (
                    <div key={role} className="flex items-center gap-3">
                      <span className="text-xs text-nexus-muted w-16 shrink-0 text-right">
                        {ROLE_LABELS[role as UserRole] || role}
                      </span>
                      <div className="flex-1 h-6 bg-nexus-bg rounded-lg overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-nexus-primary/40 to-nexus-primary/20 rounded-lg transition-all duration-700"
                          style={{ width: `${percentage}%` }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-nexus-muted">
                          {data.count}单 · ¥{data.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </motion.div>

      {/* 搜索 + 筛选 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap items-center gap-4"
      >
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-nexus-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索用户名或订单号…"
            className="w-full bg-nexus-bg border border-nexus-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-amber-500/50 focus:shadow-[0_0_0_3px_rgba(245,158,11,0.1)] transition-all"
          />
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-2">
          {(['all', 'completed', 'pending', 'refunded', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                statusFilter === status
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'text-nexus-muted border-nexus-border hover:text-nexus-text'
              }`}
            >
              {status === 'all' ? '全部' : STATUS_CONFIG[status].label}
            </button>
          ))}
        </div>

        {/* 类型筛选 */}
        <div className="flex items-center gap-2">
          {(['all', 'upgrade', 'recharge'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                typeFilter === type
                  ? 'bg-nexus-primary/15 text-nexus-primary border-nexus-primary/30'
                  : 'text-nexus-muted border-nexus-border hover:text-nexus-text'
              }`}
            >
              {type === 'all' ? '全部类型' : TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <span className="text-xs text-nexus-muted font-mono ml-auto">
          共 {filteredOrders.length} 条订单
        </span>
      </motion.div>

      {/* 订单列表 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden"
      >
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">订单号</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">用户</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">类型</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">金额</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">积分</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">状态</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">时间</th>
              <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {paged.map((order) => {
              const statusConf = STATUS_CONFIG[order.status];
              const StatusIcon = statusConf.icon;
              return (
                <tr key={order.id} className="hover:bg-nexus-bg/50 transition-colors">
                  <td className="p-4">
                    <span className="text-xs font-mono text-nexus-muted">#{order.id}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-nexus-text font-medium">{order.username}</span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${
                      order.type === 'upgrade'
                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    }`}>
                      {order.type === 'upgrade' ? <ArrowUpRight size={10} /> : <Zap size={10} />}
                      {TYPE_LABELS[order.type]}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm font-mono text-nexus-text">¥{Number(order.amount)}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm font-mono text-nexus-primary">{order.credits.toLocaleString()}</span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-bold border ${statusConf.color}`}>
                      <StatusIcon size={10} />
                      {statusConf.label}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-nexus-muted font-mono">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-1.5 rounded-lg text-nexus-muted hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                      title="查看详情"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}

            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="p-12 text-center text-nexus-muted text-sm">
                  {loading ? '加载中…' : '暂无订单数据'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
            <span className="text-[11px] text-nexus-muted font-mono">
              共 {filteredOrders.length} 条 · 第 {currentPage}/{totalPages} 页
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

      {/* 订单详情弹窗 */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl max-w-md w-full shadow-2xl shadow-black/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 标题 */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-nexus-border bg-nexus-surface-alt/30">
                <ShoppingCart size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold text-nexus-text">订单详情</h3>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="ml-auto p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 详情内容 */}
              <div className="px-6 py-5 space-y-3">
                <DetailRow label="订单号" value={`#${selectedOrder.id}`} mono />
                <DetailRow label="用户" value={selectedOrder.username} />
                <DetailRow label="订单类型" value={TYPE_LABELS[selectedOrder.type]} />
                {selectedOrder.planName && (
                  <DetailRow label="方案名称" value={selectedOrder.planName} />
                )}
                <DetailRow label="订单金额" value={`¥${Number(selectedOrder.amount)}`} />
                <DetailRow label="获得积分" value={`${selectedOrder.credits.toLocaleString()} 积分`} highlight />
                {selectedOrder.hasFirstBonus && (
                  <DetailRow label="首次加赠" value={`+${(selectedOrder.firstBonusCredits ?? 0).toLocaleString()} 积分`} highlight />
                )}
                <DetailRow label="订单状态" value={STATUS_CONFIG[selectedOrder.status].label} />
                <DetailRow label="创建时间" value={formatDate(selectedOrder.createdAt)} mono />
                <DetailRow label="更新时间" value={formatDate(selectedOrder.updatedAt)} mono />
              </div>

              {/* 状态操作 */}
              <div className="px-6 py-4 border-t border-nexus-border flex items-center justify-between">
                <span className="text-[10px] text-nexus-muted">状态操作</span>
                <div className="flex items-center gap-2">
                  {selectedOrder.status === 'pending' && (
                    <button
                      onClick={() => handleStatusChange(selectedOrder.id, 'completed')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all"
                    >
                      确认完成
                    </button>
                  )}
                  {selectedOrder.status === 'completed' && (
                    <button
                      onClick={() => handleStatusChange(selectedOrder.id, 'refunded')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all"
                    >
                      退款
                    </button>
                  )}
                  {selectedOrder.status === 'refunded' && (
                    <button
                      onClick={() => handleUndoRefund(selectedOrder.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-all"
                    >
                      撤销退款
                    </button>
                  )}
                  {selectedOrder.status === 'pending' && (
                    <button
                      onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-nexus-border text-nexus-muted hover:text-nexus-text transition-all"
                    >
                      取消
                    </button>
                  )}
                  {/* 删除按钮 — 所有状态均可删除 */}
                  <button
                    onClick={() => handleDeleteOrder(selectedOrder.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="px-3 py-1.5 rounded-lg text-xs text-nexus-muted hover:text-nexus-text transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 详情行组件 */
function DetailRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-nexus-muted">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? 'text-nexus-primary font-bold' : 'text-nexus-text'}`}>
        {value}
      </span>
    </div>
  );
}
