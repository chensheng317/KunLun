import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ArrowRight, Sparkles } from 'lucide-react';

/**
 * Hero 核心展示区组件
 * NOTE: 包含大标题、LLM 命令行体验框和动态背景光晕
 * 采用多层视差装饰营造深度感，模拟"高能运行中"的视觉张力
 */
export default function HeroSection() {
  const [inputValue, setInputValue] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 延迟触发入场动画
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const placeholderExamples = [
    '分析今日所有渠道的退款率趋势...',
    '批量更新 Shopify 商品价格为 9 折...',
    '生成本周各平台销售对比报告...',
    '检测是否有商品存在侵权风险...',
  ];

  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholderExamples.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="home"
      ref={sectionRef}
      className="relative pt-32 pb-24 px-6 overflow-hidden min-h-screen flex flex-col justify-center"
    >
      {/* 多层背景装饰 */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />

      {/* 主光晕 */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-nexus-primary/[0.04] blur-[150px] rounded-full pointer-events-none" />
      {/* 副光晕 */}
      <div className="absolute bottom-[-100px] right-[-200px] w-[600px] h-[600px] bg-nexus-surface-alt/30 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[20%] left-[-100px] w-[400px] h-[400px] bg-nexus-secondary/[0.03] blur-[100px] rounded-full pointer-events-none animate-float" />

      {/* 装饰性浮动粒子 */}
      <div className="absolute top-[15%] right-[15%] w-2 h-2 rounded-full bg-nexus-primary/40 animate-float" style={{ animationDelay: '0s' }} />
      <div className="absolute top-[25%] left-[10%] w-1.5 h-1.5 rounded-full bg-nexus-secondary/30 animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-[30%] right-[25%] w-1 h-1 rounded-full bg-nexus-primary/50 animate-float" style={{ animationDelay: '4s' }} />
      <div className="absolute bottom-[20%] left-[20%] w-2.5 h-2.5 rounded-full bg-nexus-secondary/20 animate-float" style={{ animationDelay: '1s' }} />

      <div className={`max-w-7xl mx-auto relative z-10 text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* 版本标签 */}
        <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-nexus-primary/30 bg-nexus-primary/[0.06] text-nexus-primary text-xs font-bold mb-10 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nexus-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-nexus-primary" />
          </span>
          V2.5 数字中枢系统已上线
          <Sparkles size={14} className="ml-1" />
        </div>

        {/* 主标题 */}
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight mb-8 leading-tight">
          重塑跨平台
          <br />
          <span className="text-gradient-primary">自动化运营新维度</span>
        </h1>

        {/* 副标题 */}
        <p className="max-w-2xl mx-auto text-nexus-muted text-lg md:text-xl mb-14 leading-relaxed">
          昆仑工坊：专为全球电商精英打造的数字中枢。集成 AutoGLM 深度语义识别，
          让复杂的业务链路在毫秒级自动完成响应与流转。
        </p>

        {/* LLM 命令行体验框 */}
        <div className="relative max-w-2xl mx-auto w-full group">
          {/* 外层发光边框 */}
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
              placeholder={`输入指令，例如：${placeholderExamples[currentPlaceholder]}`}
              className="w-full bg-transparent border-none outline-none text-nexus-text placeholder-nexus-muted/60 py-3 px-2 text-sm md:text-base"
            />
            <button
              id="hero-execute-btn"
              className="bg-nexus-surface-alt hover:bg-nexus-primary hover:text-nexus-inverse text-nexus-primary px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 shrink-0 flex items-center gap-2"
            >
              执行
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* 底部标签提示 */}
        <div className="flex flex-wrap justify-center gap-3 mt-8 text-xs text-nexus-muted/60">
          {['自然语言驱动', 'AutoGLM 支持', '多平台联动', '实时数据分析'].map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full border border-nexus-border/30 bg-nexus-surface/30">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
