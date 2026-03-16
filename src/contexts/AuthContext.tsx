import { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * 全局认证上下文
 * NOTE: 使用 localStorage 做轻量级前端模拟，非生产级方案
 * 注册用户存储在 localStorage 的 'kunlun_users' 键中
 * 当前登录用户存储在 'kunlun_current_user' 键中
 */

interface UserInfo {
  username: string;
  role: string;
  createdAt: string;
}

interface AuthContextType {
  /** 当前登录用户，null 表示未登录 */
  user: UserInfo | null;
  /** 是否已登录 */
  isLoggedIn: boolean;
  /**
   * 登录
   * @returns 错误信息，null 表示成功
   */
  login: (username: string, password: string) => string | null;
  /**
   * 注册
   * @returns 错误信息，null 表示成功
   */
  register: (username: string, password: string) => string | null;
  /** 退出登录 */
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_KEY = 'kunlun_users';
const CURRENT_USER_KEY = 'kunlun_current_user';

/** 从 localStorage 读取已注册用户列表 */
function getStoredUsers(): Record<string, { password: string; role: string; createdAt: string }> {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 从 localStorage 读取当前用户 */
function getStoredCurrentUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(() => getStoredCurrentUser());

  // 同步 localStorage 变化（多 Tab 场景）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CURRENT_USER_KEY) {
        setUser(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const login = useCallback((username: string, password: string): string | null => {
    const users = getStoredUsers();
    const trimmedName = username.trim();

    if (!trimmedName || !password) {
      return '用户名和密码不能为空';
    }

    const entry = users[trimmedName];
    if (!entry) {
      return '该用户不存在，请先注册';
    }
    if (entry.password !== password) {
      return '密码错误，请重试';
    }

    const userInfo: UserInfo = {
      username: trimmedName,
      role: entry.role,
      createdAt: entry.createdAt,
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo));
    setUser(userInfo);
    return null;
  }, []);

  const register = useCallback((username: string, password: string): string | null => {
    const users = getStoredUsers();
    const trimmedName = username.trim();

    if (!trimmedName) return '用户名不能为空';
    if (trimmedName.length < 2) return '用户名至少 2 个字符';
    if (!password) return '密码不能为空';
    if (password.length < 4) return '密码至少 4 个字符';
    if (users[trimmedName]) return '该用户名已被注册';

    const now = new Date().toISOString();
    users[trimmedName] = {
      password,
      role: '普通用户',
      createdAt: now,
    };
    localStorage.setItem(USERS_KEY, JSON.stringify(users));

    // 注册成功后自动登录
    const userInfo: UserInfo = {
      username: trimmedName,
      role: '普通用户',
      createdAt: now,
    };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(userInfo));
    setUser(userInfo);
    return null;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(CURRENT_USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: user !== null,
        login,
        register,
        logout,
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
