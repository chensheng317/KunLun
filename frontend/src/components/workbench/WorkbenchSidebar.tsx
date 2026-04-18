import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { assetUrl } from '../../utils/asset-url';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Cpu,
  Wrench,
  FlaskConical,
  Database,
  Clock,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';

/**
 * 工作台侧边栏组件
 * NOTE: 支持展开（w-64）/ 折叠（w-[72px]）两种状态
 * 折叠时只展示图标，hover 后显示 tooltip；展开时显示完整文字
 * 所有宽度过渡均使用 CSS transition 实现丝滑动画
 */

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onUserClick: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}



export default function WorkbenchSidebar({
  activeTab,
  setActiveTab,
  onUserClick,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const { user, membershipExpiry } = useAuth();
  const { t } = useTranslation();
  const displayName = user?.username || t('common.noData');
  const displayRole = user?.role ? ROLE_LABELS[user.role as UserRole] || user.role : t('common.online');

  // NOTE: 导航项使用翻译 key
  const navItems = useMemo(() => [
    { id: 'home', label: t('workbench.home'), icon: Home },
    { id: 'workers', label: t('workbench.digitalWorkers'), icon: Cpu, badge: 'FREE' },
    { id: 'factory', label: t('workbench.digitalFactory'), icon: Wrench, badge: 'PRO' },
    { id: 'lab', label: t('workbench.lab'), icon: FlaskConical, badge: 'BETA' },
    { id: 'assets', label: t('workbench.assetLibrary'), icon: Database },
    { id: 'history', label: t('workbench.history'), icon: Clock },
  ], [t]);

  // NOTE: 格式化会员到期日期，已过期或无会员时返回 null
  const expiryText = (() => {
    if (!membershipExpiry) return null;
    const d = new Date(membershipExpiry);
    if (d.getTime() < Date.now()) return null;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日到期`;
  })();

  return (
    <aside
      className={`fixed inset-y-0 left-0 bg-nexus-bg border-r border-nexus-border flex flex-col z-20 transition-all duration-300 ease-in-out ${collapsed ? 'w-[72px]' : 'w-64'
        }`}
    >
      {/* Logo 区域 */}
      <div className="h-16 flex items-center px-4 border-b border-nexus-border">
        <Link to="/" className="flex items-center gap-3 group min-w-0">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-cyber-glow group-hover:shadow-cyber-glow-hover transition-shadow duration-300 shrink-0">
            <img src={assetUrl('/logo.png')} alt="KunLun Logo" className="w-full h-full object-cover" />
          </div>
          <span
            className={`text-lg font-bold tracking-wide text-nexus-text whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
              }`}
          >
            昆仑工坊
          </span>
        </Link>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2.5 space-y-1.5">
        {/* 核心中枢标题 + 折叠按钮 */}
        <div className="flex items-center justify-between px-2 mb-3">
          <span
            className={`text-[11px] font-semibold text-nexus-muted uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}
          >
            核心中枢
          </span>
          <button
            onClick={onToggleCollapse}
            className="cursor-target w-7 h-7 rounded-md flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface transition-all duration-200 shrink-0"
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id} className="relative group/nav">
              <button
                onClick={() => setActiveTab(item.id)}
                className={`relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-3'
                  } py-2.5 rounded-lg transition-all duration-200 text-sm font-medium cursor-target ${isActive
                    ? 'text-nexus-primary bg-nexus-surface border border-nexus-primary/20 shadow-[inset_0_0_15px_rgba(62,237,231,0.08)]'
                    : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface/50 border border-transparent'
                  }`}
              >
                {/* 激活指示条 */}
                {isActive && (
                  <motion.div
                    layoutId="active-sidebar-indicator"
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-nexus-primary rounded-l-lg shadow-[0_0_10px_rgba(62,237,231,0.8)]"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}

                <div className={`flex items-center gap-3 relative z-10 ${collapsed ? 'gap-0' : ''}`}>
                  <Icon
                    size={18}
                    className={`shrink-0 ${isActive ? 'text-nexus-primary drop-shadow-[0_0_5px_rgba(62,237,231,0.5)]' : ''}`}
                  />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
                      }`}
                  >
                    {item.label}
                  </span>
                </div>

                {/* Badge — 折叠时隐藏 */}
                {item.badge && !collapsed && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold relative z-10 ${item.badge === 'PRO'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : item.badge === 'BETA'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-nexus-secondary/20 text-nexus-secondary border border-nexus-secondary/30'
                      }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>

              {/* 折叠态 Tooltip — 悬浮显示导航名称 */}
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-nexus-surface border border-nexus-border text-xs font-medium text-nexus-text whitespace-nowrap opacity-0 group-hover/nav:opacity-100 pointer-events-none transition-opacity duration-200 z-50 shadow-lg">
                  {item.label}
                  {item.badge && (
                    <span className={`ml-2 text-[10px] px-1 py-0.5 rounded font-bold ${item.badge === 'PRO' ? 'text-amber-400' : item.badge === 'BETA' ? 'text-purple-400' : 'text-nexus-secondary'
                      }`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 底部用户面板 */}
      <div className={`border-t border-nexus-border transition-all duration-300 ${collapsed ? 'py-3' : 'p-3'}`}>
        <button
          onClick={onUserClick}
          className={`flex items-center transition-all duration-300 group/user relative cursor-target ${collapsed
            ? 'w-full justify-center py-2'
            : 'w-full gap-3 p-3 rounded-xl bg-nexus-surface border border-nexus-border hover:border-nexus-primary/50 hover:shadow-cyber-glow'
            }`}
        >
          <div className="relative shrink-0">
            <div
              className={`w-9 h-9 rounded-lg border flex items-center justify-center bg-nexus-primary/20 text-nexus-primary font-bold text-sm transition-colors ${collapsed
                ? 'border-nexus-border group-hover/user:border-nexus-primary group-hover/user:shadow-cyber-glow'
                : 'border-nexus-border group-hover/user:border-nexus-primary'
                }`}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-nexus-primary rounded-full border-2 border-nexus-surface animate-glow-pulse" />
          </div>

          {/* 文字信息 — 折叠时隐藏 */}
          <div
            className={`flex flex-col text-left min-w-0 transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden flex-none' : 'opacity-100 w-auto flex-1'
              }`}
          >
            <span className="text-sm font-medium text-nexus-text group-hover/user:text-nexus-primary transition-colors truncate">
              {displayName}
            </span>
            <span className="text-[11px] text-nexus-muted truncate">{displayRole}</span>
            {/* NOTE: 付费会员显示到期日，游客/管理员不显示 */}
            {expiryText && (
              <span className="text-[9px] text-nexus-primary/60 truncate mt-0.5">
                {expiryText}
              </span>
            )}
          </div>

          {!collapsed && (
            <Settings size={15} className="text-nexus-muted group-hover/user:text-nexus-primary transition-colors shrink-0" />
          )}

          {/* 折叠态 Tooltip */}
          {collapsed && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-nexus-surface border border-nexus-border text-xs font-medium text-nexus-text whitespace-nowrap opacity-0 group-hover/user:opacity-100 pointer-events-none transition-opacity duration-200 z-50 shadow-lg">
              {displayName} · {displayRole}
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
