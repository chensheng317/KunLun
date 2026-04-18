import { useState, useEffect, useCallback } from 'react';

/**
 * 全局主题管理 Hook
 * NOTE: 支持 dark / light / system 三种模式
 * 用户偏好持久化到 localStorage('kunlun_theme')
 * 通过 <html data-theme="..."> 属性驱动 CSS 变量切换
 */

type ThemeMode = 'dark' | 'light' | 'system';

const LS_KEY = 'kunlun_theme';

/**
 * 获取系统偏好的主题
 * NOTE: 用户要求「跟随系统」模式始终使用深色主题作为默认值
 * @returns 始终返回 'dark'
 */
function getSystemPreference(): 'dark' | 'light' {
  return 'dark';
}

/**
 * 将主题应用到 DOM
 * @param resolved 实际生效的主题（dark 或 light）
 */
function applyTheme(resolved: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', resolved);
}

/**
 * useTheme — 全局主题管理 Hook
 * @returns { mode, resolvedTheme, setMode }
 * - mode: 用户选择的模式（dark/light/system）
 * - resolvedTheme: 实际生效的主题（dark/light）
 * - setMode: 切换主题模式
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as ThemeMode | null;
      return saved && ['dark', 'light', 'system'].includes(saved) ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  // NOTE: 根据 mode 计算实际生效的主题
  const resolvedTheme = mode === 'system' ? getSystemPreference() : mode;

  // 初始化 + mode 变更时应用主题
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // NOTE: system 模式下监听系统主题变化，实时切换
  useEffect(() => {
    if (mode !== 'system') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      applyTheme(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(LS_KEY, newMode);
  }, []);

  return { mode, resolvedTheme, setMode };
}

/**
 * 初始化主题（在 App 挂载前调用，防止闪白）
 * NOTE: 这是一个同步函数，在 main.tsx 中 import 时立即执行
 */
export function initTheme() {
  try {
    const saved = localStorage.getItem(LS_KEY) as ThemeMode | null;
    const mode = saved && ['dark', 'light', 'system'].includes(saved) ? saved : 'dark';
    const resolved = mode === 'system' ? getSystemPreference() : mode;
    applyTheme(resolved);
  } catch {
    applyTheme('dark');
  }
}
