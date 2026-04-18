import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, ArrowRight, Sparkles } from 'lucide-react';
import LiquidEther from './react-bits/LiquidEther';

import ShinyText from './react-bits/ShinyText';

/**
 * 将 CSS 变量名解析为实际颜色值
 * NOTE: Three.js 的 Color 构造函数不支持 CSS var() 语法，
 * 必须通过 getComputedStyle 在运行时解析为 hex/rgb 字符串
 */
function resolveCssColor(varName: string): string {
  const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return computed || '#000000';
}

/**
 * Hero 核心展示区组件（React Bits 增强版）
 * NOTE: LiquidEther 流体背景 + ShinyText 光泽副标题
 * 配色严格遵循昆仑工坊赛博主题
 */
export default function HeroSection() {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  // NOTE: 监听主题状态，用于重新解析 CSS 变量给 WebGL 着色器
  const [themeKey, setThemeKey] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // NOTE: MutationObserver 监听 data-theme 属性变化，触发 WebGL 颜色重解析
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeKey(document.documentElement.getAttribute('data-theme') || 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // NOTE: 运行时将 CSS 变量解析为实际颜色值
  // Three.js Color 构造函数只接受 hex/rgb 字符串，不支持 var() 语法
  const resolvedColors = useMemo(() => [
    resolveCssColor('--color-nexus-primary'),
    resolveCssColor('--color-nexus-secondary'),
    resolveCssColor('--color-nexus-surface-alt'),
  ], [themeKey]);

  const placeholderExamples = [
    '输入指令，例如：打开微信，帮我回复一下微信的客户们...',
    '输入指令，例如：打开抖音开发者平台，帮我统计一下最新发布的短视频数据...',
    '输入指令，例如：打开平台，复制我给你的链接，拆解一下爆款逻辑，给我分析报告...',
    '输入指令，例如：像人类一样刷会短视频...',
    '输入指令，例如：帮我把相册里最新保存的这个视频发布到各大平台...',
    '输入指令，例如：检测店铺健康风险，收集店铺以及商品最新的评论给我汇报...',
  ];

  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholderExamples.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  /**
   * 首页"执行"按钮点击 — 携带指令跳转到工作台数字员工页面
   * NOTE: 使用 URL query 参数传递指令文本，WorkbenchPage 读取后派发自定义事件给 DigitalWorkersPage
   */
  const handleExecuteClick = useCallback(() => {
    const trimmed = inputValue.trim();
    // 即使输入为空也跳转到数字员工页面（不带 command 参数）
    const params = new URLSearchParams({ tab: 'workers' });
    if (trimmed) {
      params.set('command', trimmed);
    }
    navigate(`/workbench?${params.toString()}`);
  }, [inputValue, navigate]);

  return (
    <section
      id="home"
      className="relative pt-32 pb-24 px-6 overflow-hidden h-screen flex flex-col justify-center snap-start"
    >
      {/* Liquid Ether 流体背景 — Three.js GPU 流体模拟
        * NOTE: 必须用 absolute inset-0 容器包裹，否则 LiquidEther 的 h-full 没有父高度可继承，
        * 导致 container 高度为 0，WebGL canvas 不可见，isPointInside 永远返回 false
        */}
      <div className="absolute inset-0 z-0">
        <LiquidEther
          colors={resolvedColors}
          mouseForce={50}
          cursorSize={200}
          resolution={0.5}
          autoDemo
          autoSpeed={1.5}
          autoIntensity={4.0}
          autoResumeDelay={800}
          autoRampDuration={0.4}
          className="opacity-80"
        />
      </div>

      {/* 叠加微弱网格纹理 */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />

      <div className={`max-w-7xl mx-auto relative z-10 text-center select-none transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* 版本标签 */}
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-nexus-primary/30 bg-nexus-primary/[0.06] text-nexus-primary text-xs font-bold mb-10 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nexus-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-nexus-primary" />
          </span>
          <ShinyText
            text="昆仑定乾坤，电商启新程"
            speed={3}
            shineColor="var(--color-nexus-primary)"
            color="var(--color-nexus-secondary)"
            className="text-xs font-bold"
          />
          <Sparkles size={14} className="ml-1" />
        </div>

        {/* 主标题 */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-8 leading-tight font-hero">
          <span className="text-nexus-text">一人成军</span>
          <br />
          <span className="text-nexus-primary">指挥您的AI手机团队</span>
        </h1>

        {/* 副标题 — ShinyText 光泽效果 */}
        <p className="max-w-4xl mx-auto text-lg md:text-xl mb-14 leading-relaxed">
          <ShinyText
            text="昆仑工坊：双轮驱动的AI电商自动化平台，专为全球电商精英打造的全域数字中枢。"
            speed={4}
            shineColor="var(--color-nexus-primary)"
            color="var(--color-nexus-muted)"
            className="text-lg md:text-xl leading-relaxed"
          />
        </p>

        {/* LLM 命令行体验框 */}
        <div className="relative max-w-2xl mx-auto w-full group">
          <div className={`absolute -inset-0.5 rounded-2xl transition-all duration-500 ${
            isInputFocused
              ? 'bg-gradient-to-r from-nexus-primary via-nexus-secondary to-nexus-primary opacity-50 blur-sm'
              : 'bg-gradient-to-r from-nexus-primary to-nexus-secondary opacity-15 blur-sm group-hover:opacity-30'
          }`} />

          <div className={`relative flex items-center bg-nexus-surface/80 backdrop-blur-xl border rounded-2xl p-2 transition-all duration-300 ${
            isInputFocused ? 'border-nexus-primary/50 shadow-cyber-glow' : 'border-nexus-border hover:border-nexus-border/80'
          }`}>
            <Terminal className="text-nexus-muted ml-3 mr-2 shrink-0" size={20} />
            <input
              id="hero-command-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleExecuteClick(); }}
              placeholder={placeholderExamples[currentPlaceholder]}
              className="w-full bg-transparent border-none outline-none text-nexus-text placeholder-nexus-muted/60 py-3 px-2 text-sm md:text-base"
            />
            <button
              id="hero-execute-btn"
              onClick={handleExecuteClick}
              className="bg-nexus-surface-alt hover:bg-nexus-primary hover:text-nexus-inverse text-nexus-primary px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 shrink-0 flex items-center gap-2"
            >
              执行
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* 底部标签 */}
        <div className="flex flex-wrap justify-center gap-3 mt-8 text-xs text-nexus-muted/60">
          {['全自动化', 'Phone Agent', '零门槛', '无学习成本', '自然语言驱动'].map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full border border-nexus-border/30 bg-nexus-surface/30 backdrop-blur-sm">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
