import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, ROLE_LABELS } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';
import { useTheme } from '../../hooks/useTheme';
import {
  User,
  Languages,
  Palette,
  LogOut,
  LogIn,
  ChevronRight,
  X,
  KeyRound,
  PenLine,
  ShoppingBag,
  Coins,
  Headset,
  Check,
  Sun,
  Moon,
  Monitor,
  CalendarClock,
} from 'lucide-react';

/**
 * 用户设置弹窗组件（重构版）
 * NOTE: 附着在侧栏用户卡片旁边的弹窗，不再使用全屏遮罩
 * 包含四个二级导航：账户、语言、主题、退出/登录
 * sidebarCollapsed 决定弹窗的定位偏移
 */

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarCollapsed: boolean;
  /** 跳转到积分记录 tab */
  onNavigateToCredits?: () => void;
  /** 跳转到个人中心指定子 Tab */
  onNavigateToProfile?: (tab: string) => void;
}

/** 二级导航 Tab */
type SettingsTab = 'account' | 'language' | 'theme' | 'customer-service' | null;

/** 可选语言 */
const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
];

/** 可选主题 — 已移除「赛博工业风」文案，不暴露给用户 */
const THEMES = [
  { id: 'dark' as const, label: '深色', desc: '默认主题', icon: Moon },
  { id: 'light' as const, label: '浅色', desc: '明亮清爽', icon: Sun },
  { id: 'system' as const, label: '跟随系统', desc: '自动适配', icon: Monitor },
];

export default function UserSettingsModal({
  isOpen,
  onClose,
  sidebarCollapsed,
  onNavigateToCredits,
  onNavigateToProfile,
}: UserSettingsModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>(null);
  const { i18n } = useTranslation();
  const { mode: currentTheme, setMode: setThemeMode } = useTheme();

  // NOTE: 当前语言从 i18next 实例读取，保证与全局状态同步
  const currentLanguage = i18n.language;
  const setCurrentLanguage = (code: string) => {
    i18n.changeLanguage(code);
  };

  const { user, isLoggedIn, logout, membershipExpiry } = useAuth();

  // NOTE: 格式化会员到期日期为 "xxxx年xx月xx日到期"
  const formatExpiry = (iso: string | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (d.getTime() < Date.now()) return null; // 已到期不显示
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日到期`;
  };
  const expiryText = formatExpiry(membershipExpiry);

  /** 退出登录 */
  const handleLogout = () => {
    logout();
    onClose();
    navigate('/');
  };

  /** 跳转登录 */
  const handleLogin = () => {
    onClose();
    navigate('/login');
  };

  /** 返回主菜单 */
  const handleBack = () => setActiveTab(null);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 透明遮罩层 — 点击关闭弹窗 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
          />

          {/* 弹窗主体 — 附着在侧栏底部的用户卡片旁边 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed z-50 w-80"
            style={{
              bottom: '16px',
              left: sidebarCollapsed ? '82px' : '272px',
            }}
          >
            <div className="bg-nexus-surface border border-nexus-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
              <AnimatePresence mode="wait">
                {/* ============ 主菜单 ============ */}
                {activeTab === null && (
                  <motion.div
                    key="main-menu"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15 }}
                  >
                    {/* 用户信息头 */}
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-center gap-3.5">
                        <div className="relative shrink-0">
                          <div className="w-12 h-12 rounded-xl border-2 border-nexus-primary shadow-cyber-glow flex items-center justify-center bg-nexus-primary/20 text-nexus-primary font-bold text-lg">
                            {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-nexus-primary rounded-full border-2 border-nexus-surface animate-glow-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-nexus-text truncate">
                            {user?.username || '未知用户'}
                          </h3>
                          <p className="text-[11px] text-nexus-muted mt-0.5">
                            {user?.role ? ROLE_LABELS[user.role as UserRole] || user.role : '基础版用户'} · 在线
                          </p>
                        </div>
                        <button
                          onClick={onClose}
                          className="cursor-target p-1.5 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-bg transition-all"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {/* NOTE: 付费会员显示到期日，游客/管理员不显示 */}
                      {expiryText && (
                        <div className="flex items-center gap-1.5 mt-2 ml-[60px]">
                          <CalendarClock size={12} className="text-nexus-primary/70" />
                          <span className="text-[10px] text-nexus-primary/70 font-medium">
                            {expiryText}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-nexus-border mx-4" />

                    {/* 导航选项列表 */}
                    <div className="p-2 space-y-0.5">
                      <NavItem
                        icon={<User size={17} />}
                        label="账户"
                        onClick={() => setActiveTab('account')}
                      />
                      <NavItem
                        icon={<Languages size={17} />}
                        label="语言"
                        subtitle={
                          LANGUAGES.find((l) => l.code === currentLanguage)
                            ?.label
                        }
                        onClick={() => setActiveTab('language')}
                      />
                      <NavItem
                        icon={<Palette size={17} />}
                        label="主题"
                        subtitle={
                          THEMES.find((t) => t.id === currentTheme)?.label
                        }
                        onClick={() => setActiveTab('theme')}
                      />
                    </div>

                    <div className="h-px bg-nexus-border mx-4" />

                    {/* 退出/登录 */}
                    <div className="p-2">
                      {isLoggedIn ? (
                        <button
                          onClick={handleLogout}
                          className="cursor-target w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-rose-400 hover:bg-rose-400/10 transition-all group"
                        >
                          <LogOut
                            size={17}
                            className="group-hover:translate-x-0.5 transition-transform"
                          />
                          <span className="text-sm font-medium">退出</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleLogin}
                          className="cursor-target w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-nexus-primary hover:bg-nexus-primary/10 transition-all group"
                        >
                          <LogIn
                            size={17}
                            className="group-hover:translate-x-0.5 transition-transform"
                          />
                          <span className="text-sm font-medium">登录</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ============ 账户子面板 ============ */}
                {activeTab === 'account' && (
                  <motion.div
                    key="account-tab"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SubPanelHeader
                      title="账户"
                      onBack={handleBack}
                    />
                    <div className="p-2 space-y-0.5">
                      <SubItem
                        icon={<PenLine size={16} />}
                        label="修改用户名"
                        onClick={() => {
                          onClose();
                          onNavigateToProfile?.('username');
                        }}
                      />
                      <SubItem
                        icon={<KeyRound size={16} />}
                        label="修改密码"
                        onClick={() => {
                          onClose();
                          onNavigateToProfile?.('password');
                        }}
                      />
                      <SubItem
                        icon={<ShoppingBag size={16} />}
                        label="我的订单"
                        onClick={() => {
                          onClose();
                          onNavigateToProfile?.('orders');
                        }}
                      />
                      <SubItem
                        icon={<Coins size={16} />}
                        label="积分记录"
                        onClick={() => {
                          onClose();
                          onNavigateToCredits?.();
                        }}
                      />
                      <SubItem
                        icon={<Headset size={16} />}
                        label="联系客服"
                        onClick={() => setActiveTab('customer-service')}
                      />
                    </div>
                  </motion.div>
                )}

                {/* ============ 语言子面板 ============ */}
                {activeTab === 'language' && (
                  <motion.div
                    key="language-tab"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SubPanelHeader
                      title="语言"
                      onBack={handleBack}
                    />
                    <div className="p-2 space-y-0.5">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => setCurrentLanguage(lang.code)}
                          className={`cursor-target w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                            currentLanguage === lang.code
                              ? 'bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary'
                              : 'text-nexus-text hover:bg-nexus-bg border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-base">{lang.flag}</span>
                            <span className="text-sm font-medium">
                              {lang.label}
                            </span>
                          </div>
                          {currentLanguage === lang.code && (
                            <Check
                              size={16}
                              className="text-nexus-primary"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ============ 主题子面板 ============ */}
                {activeTab === 'theme' && (
                  <motion.div
                    key="theme-tab"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SubPanelHeader
                      title="主题"
                      onBack={handleBack}
                    />
                    <div className="p-2 space-y-0.5">
                      {THEMES.map((theme) => {
                        const Icon = theme.icon;
                        return (
                          <button
                            key={theme.id}
                            onClick={() => setThemeMode(theme.id)}
                            className={`cursor-target w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all ${
                              currentTheme === theme.id
                                ? 'bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary'
                                : 'text-nexus-text hover:bg-nexus-bg border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon size={17} />
                              <div className="text-left">
                                <div className="text-sm font-medium">
                                  {theme.label}
                                </div>
                                <div className="text-[10px] text-nexus-muted mt-0.5">
                                  {theme.desc}
                                </div>
                              </div>
                            </div>
                            {currentTheme === theme.id && (
                              <Check
                                size={16}
                                className="text-nexus-primary"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* ============ 联系客服子面板 ============ */}
                {activeTab === 'customer-service' && (
                  <motion.div
                    key="customer-service-tab"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SubPanelHeader
                      title="联系客服"
                      onBack={handleBack}
                    />
                    <div className="p-5 flex flex-col items-center gap-3">
                      <p className="text-xs font-bold text-nexus-text">
                        微信扫码联系客服
                      </p>
                      <div className="bg-white rounded-lg p-2 w-48">
                        <img
                          src="/kefu.jpg"
                          alt="客服微信二维码"
                          className="w-full h-auto rounded"
                        />
                      </div>
                      <p className="text-[10px] text-nexus-muted">
                        工作日 9:00 – 18:00 在线
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============ 子组件 ============

/** 主菜单导航项 */
function NavItem({
  icon,
  label,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="cursor-target w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-nexus-bg transition-all group"
    >
      <div className="flex items-center gap-3 text-nexus-text group-hover:text-nexus-primary transition-colors">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {subtitle && (
          <span className="text-[11px] text-nexus-muted">{subtitle}</span>
        )}
        <ChevronRight
          size={14}
          className="text-nexus-muted group-hover:text-nexus-primary transition-colors"
        />
      </div>
    </button>
  );
}

/** 子面板头部（含返回按钮） */
function SubPanelHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-nexus-border flex items-center gap-3 bg-nexus-surface-alt/30">
      <button
        onClick={onBack}
        className="cursor-target p-1 rounded-md text-nexus-muted hover:text-nexus-primary hover:bg-nexus-bg transition-all rotate-180"
      >
        <ChevronRight size={16} />
      </button>
      <span className="text-sm font-bold text-nexus-text">{title}</span>
    </div>
  );
}

/** 账户子项 */
function SubItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="cursor-target w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-nexus-bg transition-all group"
    >
      <div className="flex items-center gap-3 text-nexus-text group-hover:text-nexus-primary transition-colors">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <ChevronRight
        size={14}
        className="text-nexus-muted group-hover:text-nexus-primary transition-colors"
      />
    </button>
  );
}
