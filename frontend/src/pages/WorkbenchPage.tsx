import { useState, useEffect, useCallback } from 'react';
import { Navigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../contexts/AuthContext';
import WorkbenchSidebar from '../components/workbench/WorkbenchSidebar';
import WorkbenchTopBar from '../components/workbench/WorkbenchTopBar';
import UserSettingsModal from '../components/workbench/UserSettingsModal';
import TargetCursor from '../components/workbench/TargetCursor';
import WorkbenchHome from './workbench/WorkbenchHome';
import DigitalWorkersPage from './workbench/DigitalWorkersPage';
import DigitalFactoryPage from './workbench/DigitalFactoryPage';
import LabPage from './workbench/LabPage';
import AssetLibraryPage from './workbench/AssetLibraryPage';
import HistoryPage from './workbench/HistoryPage';
import PersonalCenterPage from './workbench/PersonalCenterPage';
import type { ProfileTab } from './workbench/PersonalCenterPage';
import { Lock, Zap, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 模块访问权限映射
 * NOTE: 定义每个 tab 所需的最低角色，不在列表中的模块对所有角色开放
 * guest 可以访问：首页、数字员工、资产库、历史、积分
 * normal 可以访问：数字工厂
 * ultra 可以访问：实验室
 */
const TAB_MIN_ROLE: Record<string, UserRole> = {
  factory: 'normal',
  lab: 'pro',
};

/** 角色等级数值映射，用于比较权限高低 */
const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 100,
  admin: 90,
  ultra: 60,
  pro: 40,
  normal: 20,
  guest: 0,
};

/** 检查当前角色是否有权访问指定 tab */
function canAccessTab(role: UserRole, tab: string): boolean {
  const minRole = TAB_MIN_ROLE[tab];
  if (!minRole) return true; // 未配置的 tab 对所有角色开放
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minRole];
}

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
  lab: '实验室',
  assets: '资产库',
  history: '历史',
  profile: '个人中心',
};

export default function WorkbenchPage() {
  const { isLoggedIn, user, membershipExpired, dismissExpiryWarning } = useAuth();
  const userRole = (user?.role as UserRole) || 'guest';
  const [activeTab, setActiveTab] = useState('home');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // NOTE: 个人中心子 Tab，由外部导航事件指定
  const [profileSubTab, setProfileSubTab] = useState<ProfileTab>('orders');

  // URL 查询参数支持 — 首页"执行"跳转到数字员工页面时使用
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * 从 URL 参数初始化 activeTab 和预填指令
   * NOTE: 首页 HeroSection 点击"执行"后携带 ?tab=workers&command=xxx 跳转过来
   */
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const commandParam = searchParams.get('command');

    if (tabParam && NAV_LABELS[tabParam]) {
      setActiveTab(tabParam);

      // 如果携带了指令文本，延迟派发事件让 DigitalWorkersPage 预填输入框
      if (commandParam && tabParam === 'workers') {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('prefill-command', {
              detail: { command: commandParam },
            })
          );
        }, 200);
      }

      // 读取后清除 URL 参数，避免刷新时重复触发
      setSearchParams({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * NOTE: 监听“navigate-to-tool”自定义事件
   * 资产库页面点击“预览”时触发此事件，跳转到数字工厂并打开对应工具
   */
  const handleNavigateToTool = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.toolId) {
      setActiveTab('factory');
      // NOTE: 延迟派发，等 DigitalFactoryPage 挂载后再触发工具打开
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('open-factory-tool', { detail: { toolId: detail.toolId } }),
        );
      }, 100);
    }
  }, []);

  /**
   * NOTE: 监听"navigate-to-tab"自定义事件
   * 用于从深层组件直接切换到指定的工作台 tab（如资产库）
   */
  const handleNavigateToTab = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.tab) {
      setActiveTab(detail.tab);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('navigate-to-tool', handleNavigateToTool);
    window.addEventListener('navigate-to-tab', handleNavigateToTab);
    return () => {
      window.removeEventListener('navigate-to-tool', handleNavigateToTool);
      window.removeEventListener('navigate-to-tab', handleNavigateToTab);
    };
  }, [handleNavigateToTool, handleNavigateToTab]);

  // 路由守卫：未登录重定向到登录页
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const activeTabLabel = NAV_LABELS[activeTab] || '首页';

  const renderContent = () => {
    // NOTE: 检查当前角色是否有权访问该模块
    if (!canAccessTab(userRole, activeTab)) {
      const moduleName = NAV_LABELS[activeTab] || '该功能';
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-nexus-surface border border-nexus-border flex items-center justify-center mx-auto">
              <Lock size={28} className="text-nexus-muted/60" />
            </div>
            <h3 className="text-lg font-bold text-nexus-text">
              {moduleName} 需要升级
            </h3>
            <p className="text-sm text-nexus-muted max-w-xs mx-auto">
              您当前的方案不支持访问{moduleName}，请升级您的订阅方案以解锁更多功能。
            </p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-nexus-primary text-nexus-inverse text-sm font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all"
            >
              <Zap size={14} />
              升级方案
            </Link>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'home':
        return <WorkbenchHome />;
      case 'workers':
        return <DigitalWorkersPage />;
      case 'factory':
        return <DigitalFactoryPage />;
      case 'lab':
        return <LabPage />;
      case 'assets':
        return <AssetLibraryPage />;
      case 'history':
        return <HistoryPage />;
      case 'profile':
        return <PersonalCenterPage defaultTab={profileSubTab} />;
      default:
        return <WorkbenchHome />;
    }
  };

  return (
    <div className="h-screen bg-nexus-bg flex font-sans text-nexus-text overflow-hidden">
      {/* TargetCursor 瞄准镜光标 — 仅工作台内生效 */}
      <TargetCursor
        spinDuration={2}
        hideDefaultCursor
        parallaxOn
        hoverDuration={0.2}
        resetKey={activeTab}
      />

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
          onNavigateToCredits={() => {
            setProfileSubTab('credits');
            setActiveTab('profile');
          }}
        />
        <main className="pt-16 flex-1 overflow-hidden min-h-0">
          {renderContent()}
        </main>
      </div>

      {/* 用户设置弹窗 — 附着在侧栏用户卡片旁 */}
      <UserSettingsModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        sidebarCollapsed={sidebarCollapsed}
        onNavigateToCredits={() => {
          setProfileSubTab('credits');
          setActiveTab('profile');
        }}
        onNavigateToProfile={(tab: ProfileTab) => {
          setProfileSubTab(tab);
          setActiveTab('profile');
        }}
      />

      {/* NOTE: 会员到期弹窗 — 登录时检测到会员过期后自动弹出 */}
      <AnimatePresence>
        {membershipExpired && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={dismissExpiryWarning}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-amber-500/30 rounded-2xl max-w-md w-full shadow-2xl shadow-black/50 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-nexus-border bg-amber-500/5">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle size={18} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-400">会员已到期</h3>
                </div>
                <button
                  onClick={dismissExpiryWarning}
                  className="p-1.5 rounded-lg text-nexus-muted hover:text-nexus-text hover:bg-nexus-bg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-nexus-text leading-relaxed">
                  您的会员已到期，相关高级权限（手机配额扩展、专属功能等）已暂停使用。
                </p>
                <p className="text-xs text-nexus-muted">
                  请前往定价页续费以恢复会员权益。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={dismissExpiryWarning}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-nexus-border text-nexus-muted hover:text-nexus-text hover:border-nexus-text/30 transition-all"
                  >
                    我知道了
                  </button>
                  <Link
                    to="/pricing"
                    onClick={dismissExpiryWarning}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center bg-nexus-primary text-nexus-inverse shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all flex items-center justify-center gap-1.5"
                  >
                    <Zap size={14} />
                    立即续费
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
