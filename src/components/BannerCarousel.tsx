import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';

interface BannerSlide {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
  gradient: string;
}

/**
 * Banner 轮播组件
 * NOTE: 自动播放 + 手动切换，支持触摸滑动
 * 每张幻灯片含独立渐变背景和 CTA 按钮
 */
export default function BannerCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides: BannerSlide[] = [
    {
      id: 1,
      title: 'AutoGLM 2.0 发布',
      subtitle: '全新语义引擎',
      description: '理解力提升 300%，支持多轮复杂指令解析，让 AI 真正成为你的业务副驾。',
      ctaText: '了解更多',
      gradient: 'from-nexus-surface-alt/40 via-nexus-bg to-nexus-bg',
    },
    {
      id: 2,
      title: 'TikTok 全域打通',
      subtitle: '跨境电商利器',
      description: '一键同步商品、订单、评论至 TikTok Shop，覆盖北美、东南亚等 8 大市场。',
      ctaText: '立即体验',
      gradient: 'from-nexus-primary/10 via-nexus-bg to-nexus-bg',
    },
    {
      id: 3,
      title: '智能风控上线',
      subtitle: '合规零风险',
      description: '实时监测商品合规性，自动拦截侵权风险，保障你的每一笔交易安全无忧。',
      ctaText: '查看详情',
      gradient: 'from-nexus-secondary/15 via-nexus-bg to-nexus-bg',
    },
  ];

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // 自动播放
  useEffect(() => {
    if (isPaused) return;

    intervalRef.current = setInterval(nextSlide, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [nextSlide, isPaused]);

  // 入场动画观察
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-20 px-6 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={`max-w-7xl mx-auto transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="relative rounded-3xl overflow-hidden border border-nexus-border/30 bg-nexus-surface/30 backdrop-blur-sm min-h-[320px] md:min-h-[360px]">
          {/* 幻灯片区域 */}
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-all duration-700 p-10 md:p-16 flex flex-col justify-center ${
                i === currentSlide
                  ? 'opacity-100 translate-x-0 z-10'
                  : i < currentSlide
                  ? 'opacity-0 -translate-x-8 z-0'
                  : 'opacity-0 translate-x-8 z-0'
              }`}
            >
              {/* 渐变背景 */}
              <div className={`absolute inset-0 bg-gradient-to-r ${slide.gradient}`} />

              <div className="relative z-10 max-w-xl">
                <span className="inline-block px-3 py-1 rounded-full bg-nexus-primary/10 border border-nexus-primary/20 text-nexus-primary text-xs font-bold mb-4">
                  {slide.subtitle}
                </span>
                <h3 className="text-3xl md:text-4xl font-bold text-nexus-text mb-4">
                  {slide.title}
                </h3>
                <p className="text-nexus-muted text-base leading-relaxed mb-8 max-w-md">
                  {slide.description}
                </p>
                <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary text-sm font-bold hover:bg-nexus-primary hover:text-nexus-inverse transition-all duration-300 group/btn">
                  {slide.ctaText}
                  <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          ))}

          {/* 导航按钮 */}
          <button
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-nexus-bg/60 border border-nexus-border/50 flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50 transition-all duration-300 backdrop-blur"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-nexus-bg/60 border border-nexus-border/50 flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50 transition-all duration-300 backdrop-blur"
          >
            <ChevronRight size={20} />
          </button>

          {/* 指示器 */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentSlide
                    ? 'w-8 bg-nexus-primary shadow-cyber-glow'
                    : 'w-1.5 bg-nexus-border hover:bg-nexus-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
