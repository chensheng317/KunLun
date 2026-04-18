import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserPlus,
  TrendingUp,
  Zap,
  ShoppingCart,
  Activity,
  Crown,
  Shield,
  Star,
  User,
  UserCheck,
  Eye,
  RefreshCw,
} from 'lucide-react';
import type { UserRole } from '../../contexts/AuthContext';
import { ROLE_LABELS } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api-client';

/**
 * 管理后台 — 数据概览面板
 * NOTE: 通过后端 API 获取实时运营数据
 * 展示用户统计、角色分布（包含饼图）、最近注册用户等
 */

// --- 后端 API 响应类型定义 ---

/** GET /api/admin/overview 响应 */
interface DataOverview {
  totalUsers: number;
  totalCreditsConsumed: number;
  totalToolCalls: number;
  todayCreditsConsumed: number;
  todayToolCalls: number;
  todayNewUsers: number;
  todayOrders: number;
}

/** GET /api/users 响应中的用户条目 */
interface UserItem {
  id: number;
  username: string;
  role: UserRole;
  credits: number;
  disabled: boolean;
  createdAt: string;
  lastHeartbeat?: string | null;
}

/** GET /api/users 分页响应 */
interface UserListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: UserItem[];
}

/** 角色图标映射 */
const ROLE_ICONS: Record<UserRole, typeof Crown> = {
  super_admin: Shield,
  admin: Crown,
  ultra: Star,
  pro: Zap,
  normal: User,
  guest: Eye,
};

/** 角色颜色映射 */
const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'text-rose-400 bg-rose-500/20 border-rose-500/30',
  admin: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
  ultra: 'text-purple-400 bg-purple-500/20 border-purple-500/30',
  pro: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
  normal: 'text-nexus-muted bg-nexus-surface-alt border-nexus-border',
  guest: 'text-gray-400 bg-gray-500/20 border-gray-500/30',
};

/** 饼图颜色 */
const PIE_COLORS: Record<UserRole, string> = {
  super_admin: '#f87171',
  admin: '#fbbf24',
  ultra: '#c084fc',
  pro: '#60a5fa',
  normal: 'var(--color-nexus-muted)',
  guest: '#9ca3af',
};

/**
 * SVG 饼图组件
 * NOTE: 纯 CSS/SVG 实现，无需额外依赖
 */
function PieChart({ data, total }: { data: { role: UserRole; count: number }[]; total: number }) {
  if (total === 0) {
    return (
      <div className="w-full aspect-square flex items-center justify-center">
        <p className="text-xs text-nexus-muted">暂无数据</p>
      </div>
    );
  }

  const radius = 80;
  const cx = 100;
  const cy = 100;
  let cumulativeAngle = -90; // 从顶部开始

  const slices = data
    .filter((d) => d.count > 0)
    .map((d) => {
      const angle = (d.count / total) * 360;
      const startAngle = cumulativeAngle;
      cumulativeAngle += angle;
      return { ...d, startAngle, angle };
    });

  /** 极坐标转笛卡尔坐标 */
  const polarToCartesian = (a: number) => ({
    x: cx + radius * Math.cos((a * Math.PI) / 180),
    y: cy + radius * Math.sin((a * Math.PI) / 180),
  });

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto">
      {slices.map((slice) => {
        const start = polarToCartesian(slice.startAngle);
        const end = polarToCartesian(slice.startAngle + slice.angle);
        const largeArc = slice.angle > 180 ? 1 : 0;

        // 单项占满360度时画整圆
        if (slice.angle >= 359.99) {
          return (
            <circle
              key={slice.role}
              cx={cx}
              cy={cy}
              r={radius}
              fill={PIE_COLORS[slice.role]}
              opacity={0.85}
            />
          );
        }

        const path = [
          `M ${cx} ${cy}`,
          `L ${start.x} ${start.y}`,
          `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
          'Z',
        ].join(' ');

        return (
          <path
            key={slice.role}
            d={path}
            fill={PIE_COLORS[slice.role]}
            opacity={0.85}
            stroke="var(--color-nexus-inverse)"
            strokeWidth={2}
          />
        );
      })}
      {/* 中心空白 — 甜甜圈效果 */}
      <circle cx={cx} cy={cy} r={45} fill="var(--color-nexus-inverse)" />
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-nexus-text text-lg font-bold" fontSize="18">
        {total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-nexus-muted" fontSize="10">
        总用户
      </text>
    </svg>
  );
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<DataOverview | null>(null);
  const [roleCounts, setRoleCounts] = useState<Record<UserRole, number>>({
    super_admin: 0,
    admin: 0,
    ultra: 0,
    pro: 0,
    normal: 0,
    guest: 0,
  });
  const [recentUsers, setRecentUsers] = useState<{ username: string; role: UserRole; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * 从后端 API 加载仪表盘全部数据
   * NOTE: 并行请求 overview 和 users 两个端点
   */
  const loadDashboardData = useCallback(async () => {
    try {
      setError(null);

      // NOTE: 并行发起两个请求提升加载速度
      const [overviewData, usersData] = await Promise.all([
        apiClient.get<DataOverview>('/api/admin/overview'),
        apiClient.get<UserListResponse>('/api/users?page=1&pageSize=1000'),
      ]);

      setOverview(overviewData);

      // 统计各角色人数
      const counts: Record<UserRole, number> = {
        super_admin: 0,
        admin: 0,
        ultra: 0,
        pro: 0,
        normal: 0,
        guest: 0,
      };
      usersData.items.forEach((u) => {
        const role = (u.role as UserRole) || 'guest';
        if (counts[role] !== undefined) {
          counts[role]++;
        } else {
          counts.guest++;
        }
      });
      setRoleCounts(counts);

      // 最近注册的 5 位用户（按注册时间降序）
      const sorted = [...usersData.items]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((u) => ({
          username: u.username,
          role: u.role as UserRole,
          createdAt: u.createdAt,
        }));
      setRecentUsers(sorted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(msg);
      console.error('AdminDashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    // NOTE: 每 30 秒刷新统计数据
    const interval = setInterval(loadDashboardData, 30_000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  /** 格式化日期 */
  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  };

  const userCount = overview?.totalUsers ?? 0;

  const cards = [
    {
      title: '用户总数',
      value: overview?.totalUsers ?? 0,
      icon: Users,
      color: 'text-nexus-primary',
      bgColor: 'bg-nexus-primary/10',
      borderColor: 'border-nexus-primary/20',
    },
    {
      title: '今日新增',
      value: overview?.todayNewUsers ?? 0,
      icon: UserPlus,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
    {
      title: '活跃人数',
      value: overview?.todayNewUsers ?? 0,
      icon: UserCheck,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
    {
      title: '工具调用',
      value: overview?.totalToolCalls ?? 0,
      icon: Activity,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
    },
    {
      title: '积分消费',
      value: (overview?.totalCreditsConsumed ?? 0).toLocaleString(),
      icon: TrendingUp,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
    },
    {
      title: '今日订单',
      value: overview?.todayOrders ?? 0,
      icon: ShoppingCart,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10',
      borderColor: 'border-rose-500/20',
    },
  ];

  // 饼图数据
  const pieData = (Object.keys(roleCounts) as UserRole[]).map((role) => ({
    role,
    count: roleCounts[role],
  }));

  // 加载状态
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="text-amber-400 animate-spin" />
          <p className="text-sm text-nexus-muted">加载数据概览…</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="bg-nexus-surface border border-rose-500/30 rounded-2xl p-6 max-w-md text-center">
          <p className="text-sm text-rose-400 mb-3">{error}</p>
          <button
            onClick={loadDashboardData}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8">
      {/* 页面标题 */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
          <Activity size={22} className="text-amber-400" />
          数据概览
        </h1>
        <p className="text-sm text-nexus-muted mt-1.5">
          昆仑工坊运营数据一览。
        </p>
      </motion.div>

      {/* 统计卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className={`bg-nexus-surface border ${card.borderColor} rounded-2xl p-5 relative overflow-hidden group hover:border-nexus-border transition-all duration-300`}
            >
              {/* 背景光晕 */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 80% 20%, rgba(245,158,11,0.08), transparent 70%)',
                }}
              />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-xs text-nexus-muted mb-1 font-medium">{card.title}</p>
                  <p className={`text-2xl font-black ${card.color} font-mono`}>
                    {card.value}
                  </p>
                </div>
                <div className={`w-11 h-11 rounded-xl ${card.bgColor} flex items-center justify-center`}>
                  <Icon size={20} className={card.color} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 角色分布 — 左边数据列表 + 右边饼图 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-6"
      >
        <h3 className="text-sm font-bold text-nexus-text mb-5 flex items-center gap-2">
          <Users size={16} className="text-amber-400" />
          角色分布
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* 左侧：条形统计 */}
          <div className="space-y-3">
            {(Object.keys(roleCounts) as UserRole[]).map((role) => {
              const count = roleCounts[role];
              const percentage = userCount > 0 ? Math.round((count / userCount) * 100) : 0;
              const Icon = ROLE_ICONS[role] || User;
              const colors = ROLE_COLORS[role] || ROLE_COLORS.guest;
              return (
                <div key={role} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colors}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-nexus-text font-medium">{ROLE_LABELS[role]}</span>
                      <span className="text-xs text-nexus-muted font-mono">{count} 人 · {percentage}%</span>
                    </div>
                    <div className="h-1.5 bg-nexus-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${percentage}%`,
                          background: PIE_COLORS[role] || 'var(--color-nexus-muted)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 右侧：饼图 */}
          <div className="flex flex-col items-center gap-4">
            <PieChart data={pieData} total={userCount} />
            {/* 图例 */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
              {(Object.keys(roleCounts) as UserRole[]).filter((r) => roleCounts[r] > 0).map((role) => (
                <div key={role} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: PIE_COLORS[role] }}
                  />
                  <span className="text-[10px] text-nexus-muted whitespace-nowrap">{ROLE_LABELS[role]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 最近注册用户 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-6"
      >
        <h3 className="text-sm font-bold text-nexus-text mb-5 flex items-center gap-2">
          <UserPlus size={16} className="text-amber-400" />
          最近注册用户
        </h3>
        {recentUsers.length === 0 ? (
          <p className="text-xs text-nexus-muted text-center py-8">暂无注册用户</p>
        ) : (
          <div className="space-y-3">
            {recentUsers.map((u) => {
              const colors = ROLE_COLORS[u.role] || ROLE_COLORS.guest;
              return (
                <div
                  key={u.username}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-nexus-bg/50 hover:bg-nexus-bg transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border ${colors}`}>
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-nexus-text font-medium truncate">{u.username}</p>
                    <p className="text-[10px] text-nexus-muted">{ROLE_LABELS[u.role]}</p>
                  </div>
                  <span className="text-[10px] text-nexus-muted font-mono shrink-0">
                    {formatDate(u.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
