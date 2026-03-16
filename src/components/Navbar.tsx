import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Zap, Menu, X, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface NavbarProps {
  onNavigate?: (section: string) => void;
}

/**
 * 顶部导航栏组件
 * NOTE: 采用固定定位 + 玻璃态毛玻璃效果
 * 滚动时自动切换为半透明毛玻璃背景
 * 根据登录状态区分右侧按钮展示：
 * - 已登录：「工作台」按钮 + 用户头像
 * - 未登录：「登录」+「注册」按钮
 */
export default function Navbar({ onNavigate }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { isLoggedIn, user } = useAuth();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /** NOTE: 如果在非首页（如 /pricing），先跳转首页再滚动到对应锚点 */
  const handleNavClick = useCallback((section: string) => {
    onNavigate?.(section);
    setIsMobileMenuOpen(false);
    if (location.pathname !== '/') {
      navigate('/', { state: { scrollTo: section } });
    } else {
      const element = document.getElementById(section);
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [onNavigate, location.pathname, navigate]);

  const navLinks = [
    { id: 'home', label: '首页' },
    { id: 'features', label: '核心功能' },
    { id: 'tools', label: '第三方生态' },
    { id: 'faq', label: '常见问题' },
    { id: 'about', label: '关于' },
  ];

  return (
    <nav
      id="navbar"
      className={`fixed top-0 w-full z-50 transition-all duration-500 ${isScrolled
          ? 'bg-nexus-bg/80 backdrop-blur-xl border-b border-nexus-border/50 shadow-lg shadow-black/20'
          : 'bg-transparent'
        }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => handleNavClick('home')}
        >
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-cyber-glow group-hover:shadow-cyber-glow-hover transition-shadow duration-300">
            <img src="/logo.png" alt="KunLun Logo" className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-xl tracking-wider text-nexus-text">
            KUNLUN{' '}
            <span className="text-nexus-muted text-sm font-normal ml-1">昆仑工坊</span>
          </span>
        </div>

        {/* 桌面端导航菜单 */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-nexus-muted">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleNavClick(link.id)}
              className="relative hover:text-nexus-primary transition-colors duration-300 group/link py-1"
            >
              {link.label}
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-nexus-primary rounded-full transition-all duration-300 group-hover/link:w-full" />
            </button>
          ))}
          <Link
            to="/pricing"
            className="hover:text-nexus-primary transition-colors duration-300 relative group/link py-1"
          >
            价格
            <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-nexus-primary rounded-full transition-all duration-300 group-hover/link:w-full" />
          </Link>
        </div>

        {/* 右侧操作区 — 根据登录状态区分 */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              {/* 已登录：工作台入口 + 用户头像 */}
              <Link
                to="/workbench"
                id="cta-workbench"
                className="hidden md:flex items-center gap-2 px-6 py-2.5 rounded-full bg-nexus-primary text-nexus-inverse font-bold text-sm shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <Zap size={16} fill="currentColor" />
                工作台
              </Link>
              <Link
                to="/workbench"
                className="w-10 h-10 rounded-full border border-nexus-border overflow-hidden cursor-pointer hover:border-nexus-primary hover:shadow-cyber-glow transition-all duration-300"
              >
                <div className="w-full h-full flex items-center justify-center bg-nexus-primary/20 text-nexus-primary font-bold text-sm">
                  {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              </Link>
            </>
          ) : (
            <>
              {/* 未登录：登录 + 注册按钮 */}
              <Link
                to="/login"
                className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full border border-nexus-border text-nexus-text text-sm font-medium hover:border-nexus-primary hover:text-nexus-primary transition-all duration-300"
              >
                <LogIn size={15} />
                登录
              </Link>
              <Link
                to="/register"
                className="hidden md:flex items-center gap-2 px-6 py-2.5 rounded-full bg-nexus-primary text-nexus-inverse font-bold text-sm shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <UserPlus size={15} />
                注册
              </Link>
            </>
          )}

          {/* 移动端菜单按钮 */}
          <button
            className="md:hidden w-10 h-10 flex items-center justify-center text-nexus-muted hover:text-nexus-primary transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* 移动端菜单面板 */}
      <div
        className={`md:hidden transition-all duration-300 overflow-hidden ${isMobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="bg-nexus-bg/95 backdrop-blur-xl border-t border-nexus-border/50 px-6 py-4 space-y-3">
          {navLinks.map((link) => (
            <button
              key={link.id}
              onClick={() => handleNavClick(link.id)}
              className="block w-full text-left text-nexus-muted hover:text-nexus-primary transition-colors py-2 text-sm font-medium"
            >
              {link.label}
            </button>
          ))}
          <Link to="/pricing" className="block text-nexus-muted hover:text-nexus-primary transition-colors py-2 text-sm font-medium">
            价格
          </Link>

          {isLoggedIn ? (
            <Link to="/workbench" className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-nexus-primary text-nexus-inverse font-bold text-sm mt-4">
              <Zap size={16} fill="currentColor" />
              工作台
            </Link>
          ) : (
            <div className="flex flex-col gap-2 mt-4">
              <Link to="/login" className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-nexus-border text-nexus-text font-medium text-sm">
                <LogIn size={15} />
                登录
              </Link>
              <Link to="/register" className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-nexus-primary text-nexus-inverse font-bold text-sm">
                <UserPlus size={15} />
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
