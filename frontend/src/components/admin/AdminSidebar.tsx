import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { assetUrl } from '../../utils/asset-url';
import {
  LayoutDashboard,
  Users,
  Wrench,
  ShoppingCart,
  Coins,
  Megaphone,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_LABELS } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';

/**
 * 管理后台侧边栏
 * NOTE: 结构与 WorkbenchSidebar 保持一致的交互模式
 * 系统设置模块仅超级管理员可见
 */

interface AdminSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItemConfig {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** 仅超级管理员可见 */
  superAdminOnly?: boolean;
}

const navItems: NavItemConfig[] = [
  { id: 'dashboard', label: '数据概览', icon: LayoutDashboard },
  { id: 'users', label: '用户管理', icon: Users },
  { id: 'tools', label: '工具管理', icon: Wrench },
  { id: 'orders', label: '订单管理', icon: ShoppingCart },
  { id: 'credits', label: '积分管理', icon: Coins },
  { id: 'announcements', label: '公告管理', icon: Megaphone },
  { id: 'settings', label: '系统管理', icon: Settings, superAdminOnly: true },
];

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  collapsed,
  onToggleCollapse,
}: AdminSidebarProps) {
  const { user, isSuperAdmin } = useAuth();
  const displayName = user?.username || '未知用户';
  const displayRole = user?.role ? ROLE_LABELS[user.role as UserRole] || user.role : '管理员';

  // NOTE: 用户面板颜色根据角色动态匹配
  const role = user?.role as UserRole | undefined;
  const avatarStyle = role === 'super_admin'
    ? 'bg-rose-500/20 text-rose-400' : role === 'admin'
      ? 'bg-amber-500/20 text-amber-400' : role === 'ultra'
        ? 'bg-purple-500/20 text-purple-400' : role === 'pro'
          ? 'bg-blue-500/20 text-blue-400'
          : 'bg-nexus-surface-alt text-nexus-muted';
  const dotColor = role === 'super_admin'
    ? 'bg-rose-400' : role === 'admin'
      ? 'bg-amber-400' : role === 'ultra'
        ? 'bg-purple-400' : role === 'pro'
          ? 'bg-blue-400'
          : 'bg-nexus-muted';
  const roleTextColor = role === 'super_admin'
    ? 'text-rose-400/70' : role === 'admin'
      ? 'text-amber-400/70' : role === 'ultra'
        ? 'text-purple-400/70' : role === 'pro'
          ? 'text-blue-400/70'
          : 'text-nexus-muted/70';

  // NOTE: 根据权限过滤导航项 — 系统设置仅超级管理员可见
  const visibleItems = navItems.filter(
    (item) => !item.superAdminOnly || isSuperAdmin,
  );

  return (
    <aside
      className={`fixed inset-y-0 left-0 bg-nexus-bg border-r border-nexus-border flex flex-col z-20 transition-all duration-300 ease-in-out ${collapsed ? 'w-[72px]' : 'w-64'
        }`}
    >
      {/* Logo 区域 — 管理后台标识 */}
      <div className="h-16 flex items-center px-4 border-b border-nexus-border">
        <Link to="/workbench" className="flex items-center gap-3 group min-w-0">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-[0_0_12px_rgba(245,158,11,0.3)] group-hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-shadow duration-300 shrink-0">
            <img src={assetUrl('/logo.png')} alt="KunLun Logo" className="w-full h-full object-cover" />
          </div>
          <span
            className={`text-lg font-bold tracking-wide text-nexus-text whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
              }`}
          >
            管理后台
          </span>
        </Link>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2.5 space-y-1.5">
        {/* 标题 + 折叠按钮 */}
        <div className="flex items-center justify-between px-2 mb-3">
          <span
            className={`text-[11px] font-semibold text-nexus-muted uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              }`}
          >
            后台管理
          </span>
          <button
            onClick={onToggleCollapse}
            className="cursor-target w-7 h-7 rounded-md flex items-center justify-center text-nexus-muted hover:text-amber-400 hover:bg-nexus-surface transition-all duration-200 shrink-0"
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {visibleItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id} className="relative group/nav">
              <button
                onClick={() => setActiveTab(item.id)}
                className={`relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-3'
                  } py-2.5 rounded-lg transition-all duration-200 text-sm font-medium cursor-target ${isActive
                    ? 'text-amber-400 bg-nexus-surface border border-amber-500/20 shadow-[inset_0_0_15px_rgba(245,158,11,0.08)]'
                    : 'text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface/50 border border-transparent'
                  }`}
              >
                {/* 激活指示条 — 使用管理后台橙色 */}
                {isActive && (
                  <motion.div
                    layoutId="active-admin-indicator"
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-500 rounded-l-lg shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}

                <div className={`flex items-center gap-3 relative z-10 ${collapsed ? 'gap-0' : ''}`}>
                  <Icon
                    size={18}
                    className={`shrink-0 ${isActive ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : ''}`}
                  />
                  <span
                    className={`whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'
                      }`}
                  >
                    {item.label}
                  </span>
                </div>
              </button>

              {/* 折叠态 Tooltip */}
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-nexus-surface border border-nexus-border text-xs font-medium text-nexus-text whitespace-nowrap opacity-0 group-hover/nav:opacity-100 pointer-events-none transition-opacity duration-200 z-50 shadow-lg">
                  {item.label}
                </div>
              )}
            </div>
          );
        })}


      </nav>

      {/* 底部用户面板 */}
      <div className={`border-t border-nexus-border transition-all duration-300 ${collapsed ? 'py-3' : 'p-3'}`}>
        <div
          className={`flex items-center transition-all duration-300 relative ${collapsed
            ? 'w-full justify-center py-2'
            : 'w-full gap-3 p-3 rounded-xl bg-nexus-surface border border-nexus-border'
            }`}
        >
          <div className="relative shrink-0">
            <div
              className={`w-9 h-9 rounded-lg border border-nexus-border flex items-center justify-center ${avatarStyle} font-bold text-sm transition-colors`}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${dotColor} rounded-full border-2 border-nexus-surface`} />
          </div>

          {/* 文字信息 — 折叠时隐藏 */}
          <div
            className={`flex flex-col text-left min-w-0 transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden flex-none' : 'opacity-100 w-auto flex-1'
              }`}
          >
            <span className="text-sm font-medium text-nexus-text truncate">
              {displayName}
            </span>
            <span className={`text-[11px] ${roleTextColor} truncate`}>{displayRole}</span>
          </div>

          {/* 折叠态 Tooltip */}
          {collapsed && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-nexus-surface border border-nexus-border text-xs font-medium text-nexus-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 shadow-lg">
              {displayName} · {displayRole}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
