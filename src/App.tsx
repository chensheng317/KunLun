import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import StatsSection from './components/StatsSection';
import FeaturesSection from './components/FeaturesSection';
import BannerCarousel from './components/BannerCarousel';
import ToolsSection from './components/ToolsSection';
import CasesSection from './components/CasesSection';
import FaqSection from './components/FaqSection';
import Footer from './components/Footer';
import PricingPage from './pages/PricingPage';
import WorkbenchPage from './pages/WorkbenchPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

/**
 * KunLun 昆仑工坊 — 主应用组件
 * NOTE: AuthProvider 包裹全局，提供统一的认证上下文
 * 路由包含：首页、定价页、工作台、登录页、注册页
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 门户首页 */}
          <Route path="/" element={<HomePage />} />

          {/* 定价页 */}
          <Route path="/pricing" element={<PricingPage />} />

          {/* 登录 / 注册 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* 工作台 — 独立布局（含侧栏+顶栏） */}
          <Route path="/workbench" element={<WorkbenchPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

/**
 * 门户首页布局
 * NOTE: 经典的三部分布局：导航栏 - 内容区 - 版权
 */
function HomePage() {
  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-sans">
      <Navbar />
      <main>
        <HeroSection />
        <StatsSection />
        <BannerCarousel />
        <FeaturesSection />
        <CasesSection />
        <ToolsSection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
