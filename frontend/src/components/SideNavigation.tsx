import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, ChevronUp, ChevronDown, Zap } from 'lucide-react';

interface SideNavigationProps {
  onNext: () => void;
  onPrev: () => void;
  onTop: () => void;
  onBottom: () => void;
}

/**
 * 右侧固定侧边导航栏
 * NOTE: 四个按钮 — 回到顶部、上一页、下一页、快速开始（跳转工作台）
 * 固定在屏幕右侧中间，玻璃态半透明背景
 */
export default function SideNavigation({ onNext, onPrev, onTop, onBottom }: SideNavigationProps) {
  const navigate = useNavigate();

  const buttons = [
    {
      icon: <ChevronUp size={18} />,
      label: '回到顶部',
      onClick: onTop,
    },
    {
      icon: <ArrowUp size={18} />,
      label: '上一页',
      onClick: onPrev,
    },
    {
      icon: <ArrowDown size={18} />,
      label: '下一页',
      onClick: onNext,
    },
    {
      icon: <ChevronDown size={18} />,
      label: '回到底部',
      onClick: onBottom,
    },
    {
      icon: <Zap size={18} />,
      label: '快速开始',
      onClick: () => navigate('/workbench'),
      accent: true,
    },
  ];

  return (
    <nav
      className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2"
      aria-label="页面导航"
    >
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={btn.onClick}
          title={btn.label}
          className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 backdrop-blur-md border ${
            btn.accent
              ? 'bg-nexus-primary/20 border-nexus-primary/40 text-nexus-primary hover:bg-nexus-primary hover:text-nexus-inverse'
              : 'bg-nexus-surface/50 border-nexus-border/40 text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50'
          }`}
        >
          {btn.icon}
          {/* 悬浮提示文字 — 从右侧弹出 */}
          <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-nexus-surface/90 border border-nexus-border/40 text-xs text-nexus-text whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none backdrop-blur-md">
            {btn.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
