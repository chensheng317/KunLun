import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminDashboard from '../components/admin/AdminDashboard';
import UserManagement from '../components/admin/UserManagement';
import ToolManagement from '../components/admin/ToolManagement';
import OrderManagement from '../components/admin/OrderManagement';
import CreditManagement from '../components/admin/CreditManagement';
import AnnouncementManagement from '../components/admin/AnnouncementManagement';
import SystemSettings from '../components/admin/SystemSettings';

/**
 * 管理后台主布局页面
 * NOTE: 与工作台保持一致的三栏布局（侧栏 + 顶栏 + 内容区）
 * 双重路由守卫：
 * 1. 未登录 → 重定向到 /login
 * 2. 非管理员 → 重定向到 /workbench
 */

const TAB_LABELS: Record<string, string> = {
  dashboard: '数据概览',
  users: '用户管理',
  tools: '工具管理',
  orders: '订单管理',
  credits: '积分管理',
  announcements: '公告管理',
  settings: '系统管理',
};

export default function AdminPage() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 路由守卫：未登录 → /login
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // 路由守卫：非管理员 → /workbench
  if (!isAdmin) {
    return <Navigate to="/workbench" replace />;
  }

  const activeTabLabel = TAB_LABELS[activeTab] || '数据概览';

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <AdminDashboard />;
      case 'users':
        return <UserManagement />;
      case 'tools':
        return <ToolManagement />;
      case 'orders':
        return <OrderManagement />;
      case 'credits':
        return <CreditManagement />;
      case 'announcements':
        return <AnnouncementManagement />;
      case 'settings':
        return <SystemSettings />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="h-screen bg-nexus-bg flex font-sans text-nexus-text overflow-hidden">
      {/* 管理后台侧边栏 */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* 主内容区 */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'ml-[72px]' : 'ml-64'
        }`}
      >
        {/* 顶栏 */}
        <header
          className={`fixed top-0 right-0 h-16 bg-nexus-surface/90 backdrop-blur-xl border-b border-nexus-border z-10 flex items-center justify-between px-6 transition-all duration-300 ease-in-out ${
            sidebarCollapsed ? 'left-[72px]' : 'left-64'
          }`}
        >
          {/* 面包屑 */}
          <div className="flex items-center text-sm">
            <Link
              to="/workbench"
              className="text-nexus-muted hover:text-nexus-text transition-colors font-medium tracking-wide"
            >
              昆仑工坊
            </Link>
            <ChevronRight size={14} className="mx-2 text-nexus-border" />
            <span className="text-amber-400 font-semibold">
              管理后台
            </span>
            <ChevronRight size={14} className="mx-2 text-nexus-border" />
            <span className="text-nexus-text font-medium">
              {activeTabLabel}
            </span>
          </div>

          {/* 右侧操作区 — 返回工作台 */}
          <Link
            to="/workbench"
            className="flex items-center gap-2 bg-nexus-bg border border-nexus-primary text-nexus-primary px-4 py-2 rounded-lg text-xs font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover hover:bg-nexus-primary/10 transition-all"
          >
            返回工作台
          </Link>
        </header>

        {/* 内容区 */}
        <main className="pt-16 flex-1 overflow-hidden min-h-0">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
