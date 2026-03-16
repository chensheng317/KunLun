import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import WorkbenchSidebar from '../components/workbench/WorkbenchSidebar';
import WorkbenchTopBar from '../components/workbench/WorkbenchTopBar';
import UserSettingsModal from '../components/workbench/UserSettingsModal';
import WorkbenchHome from './workbench/WorkbenchHome';
import DigitalWorkersPage from './workbench/DigitalWorkersPage';
import DigitalFactoryPage from './workbench/DigitalFactoryPage';
import AssetLibraryPage from './workbench/AssetLibraryPage';
import HistoryPage from './workbench/HistoryPage';
import CreditsPage from './workbench/CreditsPage';

/**
 * 工作台布局页面
 * NOTE: 整合侧边栏、顶栏和内容区的三栏布局
 * 使用 state 驱动的 tab 切换（非路由），保持工作台内部快速切换体验
 * sidebarCollapsed 状态控制侧栏的展开/折叠，并联动 TopBar 和主内容区的左间距
 * 路由守卫：未登录用户会被重定向到 /login
 */

const NAV_LABELS: Record<string, string> = {
  home: '首页',
  workers: '数字员工',
  factory: '数字工厂',
  assets: '资产库',
  history: '历史',
  credits: '积分记录',
};

export default function WorkbenchPage() {
  const { isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 路由守卫：未登录重定向到登录页
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const activeTabLabel = NAV_LABELS[activeTab] || '首页';

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <WorkbenchHome />;
      case 'workers':
        return <DigitalWorkersPage />;
      case 'factory':
        return <DigitalFactoryPage />;
      case 'assets':
        return <AssetLibraryPage />;
      case 'history':
        return <HistoryPage />;
      case 'credits':
        return <CreditsPage />;
      default:
        return <WorkbenchHome />;
    }
  };

  return (
    <div className="min-h-screen bg-nexus-bg flex font-sans text-nexus-text">
      {/* 侧边栏 */}
      <WorkbenchSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onUserClick={() => setIsUserModalOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* 主内容区 — margin-left 随侧栏宽度同步过渡 */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'ml-[72px]' : 'ml-64'
        }`}
      >
        <WorkbenchTopBar
          activeTabLabel={activeTabLabel}
          sidebarCollapsed={sidebarCollapsed}
          onNavigateToCredits={() => setActiveTab('credits')}
        />
        <main className="pt-16 flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {/* 用户设置弹窗 — 附着在侧栏用户卡片旁 */}
      <UserSettingsModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        sidebarCollapsed={sidebarCollapsed}
        onNavigateToCredits={() => setActiveTab('credits')}
      />
    </div>
  );
}
