import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import BannerCarousel from './components/BannerCarousel';
import ToolsSection from './components/ToolsSection';
import CasesSection from './components/CasesSection';
import FaqSection from './components/FaqSection';
import Footer from './components/Footer';
import SideNavigation from './components/SideNavigation';
import PricingPage from './pages/PricingPage';
import WorkbenchPage from './pages/WorkbenchPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CreditRechargePage from './pages/CreditRechargePage';
import MaintenancePage from './pages/MaintenancePage';
import { useFullPageSnap } from './hooks/useFullPageSnap';

/**
 * KunLun 昆仑工坊 — 主应用组件
 * NOTE: AuthProvider 包裹全局，提供统一的认证上下文
 */
export default function App() {
  // NOTE: GitHub Pages 部署在子路径下，需设置 basename
  // 本地开发时 VITE_BASE_PATH 为空，生产环境 GitHub Actions 注入 '/KunLun'
  const basePath = import.meta.env.VITE_BASE_PATH || '';

  return (
    <BrowserRouter basename={basePath}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

/**
 * 路由层 — 维护模式拦截
 * NOTE: 从 localStorage 读取站点配置，当维护模式开启时：
 * - 管理员（admin/super_admin）正常访问所有页面
 * - /login 页面始终放行（管理员需要登录入口）
 * - 其他用户/未登录用户看到维护页
 */
function AppRoutes() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // NOTE: 每次路由变化时重新检查维护模式状态（管理员可能刚刚切换了开关）
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kunlun_site_config');
      if (raw) {
        const config = JSON.parse(raw);
        setMaintenanceMode(config.maintenanceMode === true);
      } else {
        setMaintenanceMode(false);
      }
    } catch {
      setMaintenanceMode(false);
    }
  }, [location.pathname]);

  // 维护模式下：管理员放行，/login 放行，其余显示维护页
  const isLoginPage = location.pathname === '/login';
  if (maintenanceMode && !isAdmin && !isLoginPage) {
    return <MaintenancePage />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/workbench" element={<WorkbenchPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/recharge" element={<CreditRechargePage />} />
    </Routes>
  );
}

/**
 * 门户首页 — PPT 式全屏翻页
 * NOTE: useFullPageSnap 接管滚动，每个 section 独占一屏
 * Footer（关于+版权）作为最后一个 section 参与翻页
 */
function HomePage() {
  const { goNext, goPrev, goFirst, goLast } = useFullPageSnap();

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-sans">
      <Navbar />
      <main>
        <HeroSection />
        <BannerCarousel />
        <FeaturesSection />
        <CasesSection />
        <ToolsSection />
        <FaqSection />
        <Footer />
      </main>
      <SideNavigation onNext={goNext} onPrev={goPrev} onTop={goFirst} onBottom={goLast} />
    </div>
  );
}
