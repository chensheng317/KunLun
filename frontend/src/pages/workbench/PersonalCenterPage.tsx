import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  PenLine,
  KeyRound,
  ShoppingBag,
  Coins,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  Eye,
  EyeOff,
  CalendarClock,
  Package,
  Zap,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api-client';

/** API 响应中的订单条目（来自 GET /api/orders/my） */
interface ApiOrderItem {
  id: number;
  username: string;
  type: string;
  amount: number | string;
  credits: number;
  targetRole: string | null;
  planName: string | null;
  hasFirstBonus: boolean;
  firstBonusCredits: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** API 响应中的积分变动记录（来自 GET /api/credits/records） */
interface ApiCreditItem {
  id: number;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  createdAt: string;
}

/**
 * 个人中心页面
 * NOTE: 工作台内的个人信息管理中心，整合用户名/密码修改、我的订单、积分记录、联系客服
 * 通过 defaultTab prop 可指定初始激活的子 Tab
 */

export type ProfileTab = 'username' | 'password' | 'orders' | 'credits';

interface PersonalCenterProps {
  /** 指定初始激活的子 Tab */
  defaultTab?: ProfileTab;
}

/** 子 Tab 配置 */
const TABS: { id: ProfileTab; label: string; icon: typeof User }[] = [
  { id: 'username', label: '修改用户名', icon: PenLine },
  { id: 'password', label: '修改密码', icon: KeyRound },
  { id: 'orders', label: '我的订单', icon: ShoppingBag },
  { id: 'credits', label: '积分记录', icon: Coins },
];

const PAGE_SIZE = 6;

export default function PersonalCenterPage({ defaultTab = 'orders' }: PersonalCenterProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(defaultTab);
  const { user, credits, membershipExpiry, isAdmin } = useAuth();

  // NOTE: 当 defaultTab 从外部变化时同步
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // NOTE: 管理员角色无 orders/credits Tab，自动回退到 username
  useEffect(() => {
    if (isAdmin && (activeTab === 'orders' || activeTab === 'credits')) {
      setActiveTab('username');
    }
  }, [isAdmin, activeTab]);

  const displayRole = user?.role ? ROLE_LABELS[user.role as UserRole] || user.role : '游客';

  // 会员到期日格式化
  const expiryText = (() => {
    if (!membershipExpiry) return null;
    const d = new Date(membershipExpiry);
    if (d.getTime() < Date.now()) return null;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日到期`;
  })();

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto space-y-6">
      {/* 页面标题 + 用户信息卡 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-5"
      >
        <div className="w-14 h-14 rounded-2xl border-2 border-nexus-primary shadow-cyber-glow flex items-center justify-center bg-nexus-primary/20 text-nexus-primary font-bold text-xl shrink-0">
          {user?.username?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-nexus-text flex items-center gap-2">
            <User size={20} className="text-nexus-primary" />
            个人中心
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-nexus-muted">{user?.username}</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-primary/20 text-nexus-primary font-bold border border-nexus-primary/30">
              {displayRole}
            </span>
            {expiryText && (
              <span className="flex items-center gap-1 text-[10px] text-nexus-primary/60">
                <CalendarClock size={10} />
                {expiryText}
              </span>
            )}
            <span className="text-xs text-nexus-muted font-mono">
              <Zap size={10} className="inline text-nexus-primary mr-0.5" />
              {credits.toLocaleString()} 积分
            </span>
          </div>
        </div>
      </motion.div>

      {/* 面包屑 Tab 导航 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-1.5 bg-nexus-surface border border-nexus-border rounded-xl p-1.5 overflow-x-auto"
      >
        {/* NOTE: 管理员不显示“我的订单”和“积分记录”Tab */}
        {TABS
          .filter((tab) => !isAdmin || (tab.id !== 'orders' && tab.id !== 'credits'))
          .map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-target flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-nexus-primary/10 text-nexus-primary border border-nexus-primary/30 shadow-[inset_0_0_10px_rgba(62,237,231,0.06)]'
                    : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg border border-transparent'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
      </motion.div>

      {/* 内容区 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'username' && <UsernameSection />}
          {activeTab === 'password' && <PasswordSection />}
          {activeTab === 'orders' && <OrdersSection username={user?.username || ''} />}
          {activeTab === 'credits' && <CreditsSection currentBalance={credits} username={user?.username || ''} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════
 * 子 Tab 组件
 * ════════════════════════════════ */

/** 修改用户名 */
function UsernameSection() {
  const [newName, setNewName] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const { user, updateUsername } = useAuth();

  const handleSave = async () => {
    setError('');
    try {
      const result = await updateUsername(newName);
      if (result) {
        setError(result);
        return;
      }
      // 修改成功
      setSaved(true);
      setNewName('');
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('修改用户名失败，请检查网络连接');
    }
  };

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 space-y-4 max-w-lg">
      <h2 className="text-sm font-bold text-nexus-text">修改用户名</h2>
      <div className="space-y-2">
        <label className="text-xs text-nexus-muted">当前用户名</label>
        <p className="text-sm text-nexus-text font-medium bg-nexus-bg border border-nexus-border rounded-lg px-4 py-2.5">
          {user?.username}
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-nexus-muted">新用户名</label>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="输入新用户名（至少2个字符）"
          className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg px-4 py-2.5 text-sm text-nexus-text placeholder:text-nexus-muted/50 focus:border-nexus-primary/50 focus:ring-1 focus:ring-nexus-primary/20 outline-none transition-all"
        />
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button
        onClick={handleSave}
        disabled={!newName.trim() || newName.trim().length < 2}
        className="cursor-target flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-nexus-primary text-nexus-inverse shadow-cyber-glow hover:shadow-cyber-glow-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {saved ? <Check size={14} /> : <PenLine size={14} />}
        {saved ? '已保存' : '确认修改'}
      </button>
    </div>
  );
}

/**
 * 修改密码
 * NOTE: 通过 AuthContext.updatePassword 真实修改 localStorage 中的密码
 * 验证当前密码 → 校验新密码 → 写入 localStorage → 退出后需用新密码登录
 */
function PasswordSection() {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const { updatePassword } = useAuth();

  /**
   * 保存密码 — Phase 2.7 改为 async 以适配异步 API 调用
   */
  const handleSave = async () => {
    setError('');

    // NOTE: 前端表单级校验 — 在调用后端逻辑前拦截明显错误
    if (!oldPwd) { setError('请输入当前密码'); return; }
    if (newPwd.length < 4) { setError('新密码至少 4 个字符'); return; }
    if (newPwd !== confirmPwd) { setError('两次输入的新密码不一致'); return; }

    try {
      // NOTE: 调用 AuthContext 的 updatePassword 方法（异步）
      const result = await updatePassword(oldPwd, newPwd);
      if (result) {
        setError(result);
        return;
      }

      // 修改成功：清空所有表单字段 + 显示成功提示
      setSaved(true);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('密码修改失败，请检查网络连接');
    }
  };

  /** 按钮禁用条件：任一字段为空 */
  const isDisabled = !oldPwd || !newPwd || !confirmPwd;

  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 space-y-4 max-w-lg">
      <h2 className="text-sm font-bold text-nexus-text">修改密码</h2>
      <div className="space-y-2">
        <label className="text-xs text-nexus-muted">当前密码</label>
        <div className="relative">
          <input
            type={showOld ? 'text' : 'password'}
            value={oldPwd}
            onChange={(e) => { setOldPwd(e.target.value); setError(''); }}
            placeholder="输入当前密码"
            className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg px-4 py-2.5 text-sm text-nexus-text placeholder:text-nexus-muted/50 focus:border-nexus-primary/50 outline-none transition-all pr-10"
          />
          <button onClick={() => setShowOld(!showOld)} className="cursor-target absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-primary transition-colors">
            {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-nexus-muted">新密码</label>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            value={newPwd}
            onChange={(e) => { setNewPwd(e.target.value); setError(''); }}
            placeholder="至少 4 个字符"
            className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg px-4 py-2.5 text-sm text-nexus-text placeholder:text-nexus-muted/50 focus:border-nexus-primary/50 outline-none transition-all pr-10"
          />
          <button onClick={() => setShowNew(!showNew)} className="cursor-target absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-primary transition-colors">
            {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-nexus-muted">确认新密码</label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPwd}
            onChange={(e) => { setConfirmPwd(e.target.value); setError(''); }}
            placeholder="再次输入新密码"
            className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-lg px-4 py-2.5 text-sm text-nexus-text placeholder:text-nexus-muted/50 focus:border-nexus-primary/50 outline-none transition-all pr-10"
          />
          <button onClick={() => setShowConfirm(!showConfirm)} className="cursor-target absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-primary transition-colors">
            {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {saved && <p className="text-xs text-emerald-400">密码修改成功，下次登录请使用新密码</p>}
      <button
        onClick={handleSave}
        disabled={isDisabled}
        className="cursor-target flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-nexus-primary text-nexus-inverse shadow-cyber-glow hover:shadow-cyber-glow-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {saved ? <Check size={14} /> : <KeyRound size={14} />}
        {saved ? '已保存' : '确认修改'}
      </button>
    </div>
  );
}

/**
 * 我的订单 — 从后端 API 加载
 * NOTE: Phase 2.9 — 改为调用 GET /api/orders/my，移除 getAllOrders (localStorage) 依赖
 */
function OrdersSection({ username }: { username: string }) {
  const [page, setPage] = useState(1);
  const [myOrders, setMyOrders] = useState<ApiOrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient.get<{ total: number; items: ApiOrderItem[] }>('/api/orders/my?pageSize=500')
      .then((resp) => { if (!cancelled) setMyOrders(resp.items); })
      .catch(() => { if (!cancelled) setMyOrders([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [username]);

  const totalPages = Math.max(1, Math.ceil(myOrders.length / PAGE_SIZE));
  const currentOrders = myOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statusLabel: Record<string, { text: string; cls: string }> = {
    completed: { text: '已完成', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    pending: { text: '待支付', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    refunded: { text: '已退款', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    cancelled: { text: '已取消', cls: 'bg-nexus-border text-nexus-muted border-nexus-border' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-nexus-text flex items-center gap-2">
          <ShoppingBag size={16} className="text-nexus-primary" />
          我的订单
        </h2>
        <span className="text-[11px] text-nexus-muted font-mono">共 {myOrders.length} 条</span>
      </div>

      {myOrders.length === 0 ? (
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl py-16 text-center">
          <Package size={40} className="mx-auto text-nexus-muted/40 mb-3" />
          <p className="text-sm text-nexus-muted">暂无订单记录</p>
        </div>
      ) : (
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">类型</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">方案/描述</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">金额</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">获得积分</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-center">状态</th>
                <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexus-border">
              {currentOrders.map((order) => {
                const s = statusLabel[order.status] || statusLabel.pending;
                return (
                  <tr key={order.id} className="hover:bg-nexus-bg/50 transition-colors">
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold border ${
                        order.type === 'upgrade'
                          ? 'bg-nexus-primary/20 text-nexus-primary border-nexus-primary/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}>
                        {order.type === 'upgrade' ? '升级方案' : '积分直充'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-nexus-text">
                      {order.planName || `充值 ${order.credits} 积分`}
                      {order.hasFirstBonus && (
                        <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          含首次加赠 {order.firstBonusCredits}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm font-mono font-bold text-right text-nexus-text">
                      ¥{order.amount}
                    </td>
                    <td className="p-4 text-sm font-mono font-bold text-right text-emerald-400">
                      +{order.credits.toLocaleString()}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${s.cls}`}>
                        {s.text}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-nexus-muted font-mono text-right">
                      {new Date(order.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 分页 */}
          {totalPages > 1 && (
            <PaginationBar currentPage={page} totalPages={totalPages} totalItems={myOrders.length} onChange={setPage} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 积分记录 — 从后端 API 加载
 * NOTE: Phase 2.9 — 改为调用 GET /api/credits/records，移除 getCreditRecords (localStorage) 依赖
 */
function CreditsSection({ currentBalance, username }: { currentBalance: number; username: string }) {
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<ApiCreditItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient.get<{ total: number; items: ApiCreditItem[] }>('/api/credits/records?pageSize=500')
      .then((resp) => { if (!cancelled) setRecords(resp.items); })
      .catch(() => { if (!cancelled) setRecords([]); });
    return () => { cancelled = true; };
  }, [username]);

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalConsume = records.filter((r) => r.amount < 0).reduce((sum, r) => sum + Math.abs(r.amount), 0);
  const totalRecharge = records.filter((r) => r.type === 'recharge' || r.type === 'upgrade' || r.type === 'undo_refund').reduce((sum, r) => sum + r.amount, 0);

  /** 格式化时间 */
  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return iso; }
  };

  /** 类型标签配置 */
  const typeLabel = (r: ApiCreditItem) => {
    if (r.amount < 0) return { text: '消费', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: ArrowDownRight };
    return { text: '充值', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: ArrowUpRight };
  };

  return (
    <div className="space-y-5">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
          <p className="text-xs text-nexus-muted mb-1">当前余额</p>
          <p className="text-2xl font-black text-nexus-primary font-mono">{currentBalance.toLocaleString()}</p>
        </div>
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
          <p className="text-xs text-nexus-muted mb-1">累计消费</p>
          <p className="text-2xl font-black text-rose-400 font-mono">-{totalConsume.toLocaleString()}</p>
        </div>
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5">
          <p className="text-xs text-nexus-muted mb-1">累计充值</p>
          <p className="text-2xl font-black text-emerald-400 font-mono">+{totalRecharge.toLocaleString()}</p>
        </div>
      </div>

      {/* 记录表格 */}
      <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
        {records.length === 0 ? (
          <div className="py-16 text-center">
            <Coins size={40} className="mx-auto text-nexus-muted/40 mb-3" />
            <p className="text-sm text-nexus-muted">暂无积分变动记录</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-nexus-surface-alt/40 border-b border-nexus-border">
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">类型</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider">描述</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">积分变动</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">余额</th>
                  <th className="p-4 text-[11px] font-semibold text-nexus-muted uppercase tracking-wider text-right">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nexus-border">
                {currentRecords.map((record) => {
                  const t = typeLabel(record);
                  const TIcon = t.icon;
                  return (
                    <tr key={record.id} className="hover:bg-nexus-bg/50 transition-colors">
                      <td className="p-4">
                        <div className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold border ${t.cls}`}>
                          <TIcon size={10} />
                          {t.text}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-nexus-text">{record.description}</td>
                      <td className={`p-4 text-sm font-mono font-bold text-right ${record.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {record.amount > 0 ? '+' : ''}{record.amount}
                      </td>
                      <td className="p-4 text-xs text-nexus-muted font-mono text-right">{record.balance}</td>
                      <td className="p-4 text-xs text-nexus-muted font-mono text-right">{formatDate(record.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <PaginationBar currentPage={page} totalPages={totalPages} totalItems={records.length} onChange={setPage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════
 * 通用分页组件
 * ════════════════════════════════ */

function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onChange: (page: number) => void;
}) {
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

  return (
    <div className="px-4 py-3 border-t border-nexus-border flex items-center justify-between bg-nexus-surface-alt/20">
      <span className="text-[11px] text-nexus-muted font-mono">
        共 {totalItems} 条 · 第 {currentPage}/{totalPages} 页
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(1)} disabled={currentPage === 1} className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="首页">
          <ChevronsLeft size={16} />
        </button>
        <button onClick={() => onChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={16} />
        </button>
        {getPageNumbers().map((pg, idx) =>
          pg === '...' ? (
            <span key={`dots-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-nexus-muted">…</span>
          ) : (
            <button
              key={pg}
              onClick={() => onChange(pg)}
              className={`cursor-target w-7 h-7 rounded-md text-xs font-bold transition-all ${
                pg === currentPage
                  ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                  : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface'
              }`}
            >
              {pg}
            </button>
          ),
        )}
        <button onClick={() => onChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => onChange(totalPages)} disabled={currentPage === totalPages} className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="尾页">
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
