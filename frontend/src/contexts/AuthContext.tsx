import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, setToken, clearToken, getToken } from '../utils/api-client';

/**
 * 全局认证上下文 — 纯 API 驱动架构
 * NOTE: 所有业务数据（用户、积分、订单）均由后端 PostgreSQL 持久化管理
 * 前端仅通过 JWT Token 维持会话，不再依赖 localStorage 存储业务数据
 *
 * 角色体系（由高到低）：
 * - super_admin: 超级管理员（开发者），拥有全部权限含系统配置
 * - admin: 普通管理员（昆仑工坊管理员），拥有用户/内容/工具管理权限
 * - ultra: 旗舰版用户，全功能访问
 * - pro: 专业版用户，高级功能访问
 * - normal: 基础版用户，基础功能访问
 * - guest: 游客，注册后默认角色，需购买套餐升级
 */

/** 角色类型 — 6 级角色体系 */
export type UserRole = 'super_admin' | 'admin' | 'ultra' | 'pro' | 'normal' | 'guest';

/** 角色中文显示名映射 */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '超级管理员',
  admin: '普通管理员',
  ultra: '旗舰版用户',
  pro: '专业版用户',
  normal: '基础版用户',
  guest: '游客',
};

/** 各角色初始积分数量 */
export const ROLE_INITIAL_CREDITS: Record<UserRole, number> = {
  super_admin: 0,
  admin: 0,
  ultra: 10000,
  pro: 3000,
  normal: 1000,
  guest: 50,
};

/**
 * 首次开通方案加赠积分
 * NOTE: 仅在用户首次升级到对应角色时一次性发放，与 ROLE_INITIAL_CREDITS 叠加
 * guest/admin/super_admin 无加赠
 */
export const FIRST_SUBSCRIBE_BONUS: Record<UserRole, number> = {
  super_admin: 0,
  admin: 0,
  ultra: 5000,
  pro: 1500,
  normal: 500,
  guest: 0,
};

/* ─────────────────────────────────────────────
 * 类型定义 — 保留供外部组件 import type 使用
 * ───────────────────────────────────────────── */

/** 订单状态 */
export type OrderStatus = 'pending' | 'completed' | 'refunded' | 'cancelled';
/** 订单类型：upgrade 升级方案 / recharge 积分直充 */
export type OrderType = 'upgrade' | 'recharge';

export interface OrderRecord {
  id: string;
  username: string;
  type: OrderType;
  /** 订单金额（人民币） */
  amount: number;
  /** 获得积分 */
  credits: number;
  /** 升级方案时目标角色 */
  targetRole?: UserRole;
  /** 升级方案时的方案名 */
  planName?: string;
  /** 是否包含首次加赠 */
  hasFirstBonus?: boolean;
  /** 首次加赠积分数 */
  firstBonusCredits?: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

/** 积分变动记录 — 记录每一笔积分的增减 */
export interface CreditRecord {
  id: string;
  username: string;
  /** consume=消费, recharge=充值, refund=退款扣除, undo_refund=撤销退款恢复, upgrade=升级方案赠送, admin_add=管理员发放, admin_deduct=管理员扣减 */
  type: 'consume' | 'recharge' | 'refund' | 'undo_refund' | 'upgrade' | 'admin_add' | 'admin_deduct';
  /** 正数=增加，负数=减少 */
  amount: number;
  /** 变动后的余额 */
  balance: number;
  /** 描述信息 */
  description: string;
  /** 变动时间 ISO */
  createdAt: string;
}

/**
 * 积分按月发放调度记录
 * NOTE: 年付用户的积分不一次性发放，而是分 12 个月按月发放
 */
export interface CreditScheduleEntry {
  id: string;
  username: string;
  role: UserRole;
  /** 每月发放的积分数量 */
  monthlyAmount: number;
  /** 下次发放时间 ISO */
  nextDistribution: string;
  /** 剩余发放次数 */
  remainingMonths: number;
  /** 计费周期标识 */
  billingCycle: 'monthly' | 'yearly';
  createdAt: string;
}

export interface AdminLogEntry {
  id: string;
  operator: string;
  action: string;
  target?: string;
  detail: string;
  timestamp: string;
}

/* ─────────────────────────────────────────────
 * AuthContext 定义
 * ───────────────────────────────────────────── */

interface UserInfo {
  username: string;
  role: UserRole;
  createdAt: string;
}

/** localStorage 中缓存当前用户的键名（仅用于跨 Tab 同步和快速恢复） */
const CURRENT_USER_KEY = 'kunlun_current_user';

interface AuthContextType {
  /** 当前登录用户，null 表示未登录 */
  user: UserInfo | null;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /** 是否为管理员级别（super_admin 或 admin） */
  isAdmin: boolean;
  /** 是否为超级管理员 */
  isSuperAdmin: boolean;
  /** 当前用户积分 */
  credits: number;
  /** 会员到期时间 ISO 字符串，null 表示无会员（游客/管理员） */
  membershipExpiry: string | null;
  /** 会员是否已到期（登录时检测，用于触发到期弹窗） */
  membershipExpired: boolean;
  /** 关闭到期弹窗后调用，清除到期标记 */
  dismissExpiryWarning: () => void;
  /**
   * 登录（异步，调用后端 API）
   * @returns 错误信息，null 表示成功
   */
  login: (username: string, password: string) => Promise<string | null>;
  /**
   * 注册（异步，调用后端 API）
   * @returns 错误信息，null 表示成功
   */
  register: (username: string, password: string) => Promise<string | null>;
  /** 退出登录 */
  logout: () => void;
  /**
   * 升级/续费角色（定价页购买后调用）
   * @param newRole 目标角色
   * @param billingCycle 计费周期，默认 'monthly'
   * @param price 订单金额（人民币），用于订单记录统计
   * @returns 错误信息，null 表示成功
   */
  upgradeRole: (newRole: UserRole, billingCycle?: 'monthly' | 'yearly', price?: number) => Promise<string | null>;
  /**
   * 充值积分（直接叠加到当前余额）
   * @param amount 要充值的积分数量
   */
  rechargeCredits: (amount: number) => Promise<void>;
  /**
   * 消耗积分（异步，调用后端 API）
   * @param amount 消耗的积分数量
   * @param toolName 工具名称（用于日志记录）
   * @returns 是否扣减成功（余额不足时返回 false）
   */
  consumeCredits: (amount: number, toolName: string) => Promise<boolean>;
  /**
   * 修改用户名
   * @param newUsername 新用户名
   * @returns 错误信息，null 表示成功
   */
  updateUsername: (newUsername: string) => Promise<string | null>;
  /**
   * 修改密码
   * @param oldPassword 当前密码（用于身份验证）
   * @param newPassword 新密码
   * @returns 错误信息，null 表示成功
   */
  updatePassword: (oldPassword: string, newPassword: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** 从 localStorage 缓存中恢复用户信息（仅用于首屏快速恢复，后续由 API 验证） */
function getCachedUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 提取后端 API 错误消息 */
function extractErrorMessage(err: unknown): string | null {
  if (err && typeof err === 'object' && 'detail' in err) {
    return (err as { detail: string }).detail;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => getCachedUser());
  const [creditsState, setCreditsState] = useState<number>(0);
  const [membershipExpiry, setMembershipExpiryState] = useState<string | null>(null);
  const [membershipExpired, setMembershipExpired] = useState(false);

  // NOTE: 应用启动时验证 JWT Token 有效性，无效则清除登录态
  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;
    apiClient.get<{ id: number; username: string; role: string; credits: number; membership_expiry: string | null }>('/api/auth/me')
      .then((me) => {
        const userInfo: UserInfo = {
          username: me.username,
          role: me.role as UserRole,
          createdAt: '',
        };
        setUser(userInfo);
        setCreditsState(me.credits);
        setMembershipExpiryState(me.membership_expiry ?? null);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo));
      })
      .catch(() => {
        clearToken();
        localStorage.removeItem(CURRENT_USER_KEY);
        setUser(null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: 同步 localStorage 变化（多 Tab 场景下保持一致）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CURRENT_USER_KEY) {
        setUser(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /** 登录 — 调用后端 API */
  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    const trimmedName = username.trim();
    if (!trimmedName || !password) return '用户名和密码不能为空';

    try {
      const resp = await apiClient.post<{
        accessToken: string;
        username: string;
        role: string;
        credits: number;
      }>('/api/auth/login', { username: trimmedName, password });

      setToken(resp.accessToken);
      const userInfo: UserInfo = {
        username: resp.username,
        role: resp.role as UserRole,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo));
      setUser(userInfo);
      setCreditsState(resp.credits);

      // NOTE: 发送在线心跳
      apiClient.post('/api/users/heartbeat').catch(() => {});
      return null;
    } catch (err: unknown) {
      return extractErrorMessage(err) || '登录失败，服务器不可达';
    }
  }, []);

  /** 注册 — 调用后端 API */
  const register = useCallback(async (username: string, password: string): Promise<string | null> => {
    const trimmedName = username.trim();
    if (!trimmedName) return '用户名不能为空';
    if (trimmedName.length < 2) return '用户名至少 2 个字符';
    if (!password) return '密码不能为空';
    if (password.length < 4) return '密码至少 4 个字符';

    try {
      const resp = await apiClient.post<{
        accessToken: string;
        username: string;
        role: string;
        credits: number;
      }>('/api/auth/register', { username: trimmedName, password });

      setToken(resp.accessToken);
      const userInfo: UserInfo = {
        username: resp.username,
        role: resp.role as UserRole,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo));
      setUser(userInfo);
      setCreditsState(resp.credits);
      return null;
    } catch (err: unknown) {
      return extractErrorMessage(err) || '注册失败，服务器不可达';
    }
  }, []);

  /** 退出登录 */
  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem(CURRENT_USER_KEY);
    setUser(null);
    setCreditsState(0);
    setMembershipExpiryState(null);
  }, []);

  /**
   * 升级/续费角色 — 调用后端 API 创建升级订单
   * NOTE: 后端 order_service.createOrder 会自动处理：积分发放 + 角色变更 + 首次加赠标记
   */
  const upgradeRole = useCallback(async (newRole: UserRole, billingCycle: 'monthly' | 'yearly' = 'monthly', price: number = 0): Promise<string | null> => {
    if (!user) return '请先登录';

    const baseCredits = ROLE_INITIAL_CREDITS[newRole] ?? 0;
    const isRenew = user.role === newRole;
    const roleNameMap: Record<string, string> = {
      normal: '基础版', pro: '专业版', ultra: '旗舰版',
    };
    const planName = (isRenew ? '续费 ' : '') + (roleNameMap[newRole] || newRole) + (billingCycle === 'yearly' ? '（年付）' : '（月付）');

    // NOTE: 首次加赠由后端判断和发放，前端仅传递元数据
    const firstBonus = FIRST_SUBSCRIBE_BONUS[newRole] ?? 0;

    try {
      await apiClient.post('/api/orders', {
        type: 'upgrade',
        amount: price,
        credits: baseCredits,
        targetRole: newRole,
        planName,
        hasFirstBonus: firstBonus > 0,
        firstBonusCredits: firstBonus,
      });

      // NOTE: 从后端获取最新用户信息刷新前端状态
      const me = await apiClient.get<{ username: string; role: string; credits: number; membership_expiry: string | null }>('/api/auth/me');
      const updatedUser: UserInfo = { ...user, role: me.role as UserRole };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
      setCreditsState(me.credits);
      setMembershipExpiryState(me.membership_expiry ?? null);
      return null;
    } catch (err: unknown) {
      return extractErrorMessage(err) || '升级失败，服务器不可达';
    }
  }, [user]);

  /**
   * 充值积分 — 调用后端 API 创建充值订单
   */
  const rechargeCredits = useCallback(async (amount: number): Promise<void> => {
    if (!user) return;
    const price = Math.round(amount / 10); // NOTE: 10 积分 = 1 元

    try {
      await apiClient.post('/api/orders', {
        type: 'recharge',
        amount: price,
        credits: amount,
        planName: `积分直充 ${amount}`,
        hasFirstBonus: false,
        firstBonusCredits: 0,
      });

      // NOTE: 从后端获取最新积分余额
      const me = await apiClient.get<{ credits: number }>('/api/auth/me');
      setCreditsState(me.credits);
    } catch {
      // NOTE: 充值失败静默处理，用户可重试
    }
  }, [user]);

  /**
   * 消耗积分 — 调用后端 API
   * @returns 是否扣减成功（余额不足返回 false）
   */
  const consumeCredits = useCallback(async (amount: number, toolName: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const resp = await apiClient.post<{ balance: number }>('/api/credits/consume', {
        amount,
        tool_name: toolName,
      });
      setCreditsState(resp.balance);
      return true;
    } catch {
      return false;
    }
  }, [user]);

  /**
   * 修改用户名 — 调用后端 API
   * NOTE: 后端会重新签发 JWT Token（因为 sub 字段存储的是用户名）
   */
  const updateUsername = useCallback(async (newUsername: string): Promise<string | null> => {
    if (!user) return '请先登录';
    const trimmed = newUsername.trim();
    if (!trimmed) return '用户名不能为空';
    if (trimmed.length < 2) return '用户名至少 2 个字符';
    if (trimmed === user.username) return '新用户名与当前用户名相同';

    try {
      const resp = await apiClient.put<{
        accessToken: string;
        username: string;
        role: string;
        credits: number;
      }>('/api/auth/change-username', { newUsername: trimmed });

      setToken(resp.accessToken);
      const updatedUser: UserInfo = { ...user, username: resp.username };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
      setCreditsState(resp.credits);
      return null;
    } catch (err: unknown) {
      return extractErrorMessage(err) || '修改用户名失败，服务器不可达';
    }
  }, [user]);

  /**
   * 修改密码 — 调用后端 API
   */
  const updatePassword = useCallback(async (oldPassword: string, newPassword: string): Promise<string | null> => {
    if (!user) return '请先登录';
    if (!newPassword || newPassword.length < 4) return '新密码至少 4 个字符';
    if (newPassword === oldPassword) return '新密码不能与当前密码相同';

    try {
      await apiClient.post('/api/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      return null;
    } catch (err: unknown) {
      return extractErrorMessage(err) || '修改密码失败，服务器不可达';
    }
  }, [user]);

  /** 是否为管理员级别（super_admin 或 admin） */
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  /** 是否为超级管理员 */
  const isSuperAdmin = user?.role === 'super_admin';

  /** 关闭到期弹窗 */
  const dismissExpiryWarning = useCallback(() => {
    setMembershipExpired(false);
  }, []);

  // NOTE: 定时发送心跳通知后端用户在线
  useEffect(() => {
    if (!user) return;
    const sendHeartbeat = () => {
      apiClient.post('/api/users/heartbeat').catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user) {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: user !== null,
        isAdmin,
        isSuperAdmin,
        credits: creditsState,
        membershipExpiry,
        membershipExpired,
        dismissExpiryWarning,
        login,
        register,
        logout,
        upgradeRole,
        rechargeCredits,
        consumeCredits,
        updateUsername,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 获取认证上下文 Hook
 * @throws 必须在 AuthProvider 内使用
 */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
