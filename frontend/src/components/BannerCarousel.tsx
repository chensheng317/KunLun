import { useState, useEffect, useCallback, useRef } from 'react';
import { assetUrl } from '../utils/asset-url';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import ShinyText from './react-bits/ShinyText';

interface BannerSlide {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  ctaText: string;
}

/**
 * Banner 全屏视频背景轮播组件
 * NOTE: 背景使用循环播放的视频占满整个视口，文案内容在视频上方叠加显示
 * 设计参考：Apple/Tesla 产品宣传页 — 视频背景 + 文字叠加
 */
export default function BannerCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const titleRef = useRef<HTMLDivElement>(null);

  const slides: BannerSlide[] = [
    {
      id: 1,
      title: '打造AI手机团队',
      subtitle: '全域自动化',
      description: '基于Open-AutoGLM，自然语言一键指挥数字员工，零门槛搞定电商全流程。',
      ctaText: '了解更多',
    },
    {
      id: 2,
      title: '一站式数字工厂',
      subtitle: '生产力革命',
      description: '聚合顶尖AI大模型，涵盖最新的AI应用与工作流，高效沉淀企业核心数字资产。',
      ctaText: '立即体验',
    },
    {
      id: 3,
      title: '专属个性化定制',
      subtitle: '企业级服务',
      description: '提供6大定制服务，团队深度定制开发，满足电商高阶本地部署运营需求。',
      ctaText: '查看详情',
    },
  ];

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (isPaused) return;
    intervalRef.current = setInterval(nextSlide, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [nextSlide, isPaused]);

  return (
    <section
      className="banner-fullscreen-section relative w-full h-screen overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 全屏视频背景 — 持续循环播放 */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
        src={assetUrl('/banner视频.mp4')}
      />

      {/* NOTE: 视频叠加层 — 使用 CSS 类实现主题感知，浅色模式不会出现白雾 */}
      <div className="absolute inset-0 z-[1] banner-overlay-vertical" />
      <div className="absolute inset-0 z-[1] banner-overlay-side" />

      {/* 底部向下一个 Section 的融合渐变 */}
      <div className="absolute inset-x-0 bottom-0 h-40 z-[2] banner-overlay-bottom pointer-events-none" />

      {/* 文案内容 */}
      <div
        ref={titleRef}
        className="relative z-10 h-full flex items-center"
      >
        <div className="max-w-7xl mx-auto w-full px-6 md:px-16">
          {slides.map((slide, i) => (
            <div
              key={slide.id}
              className={`absolute inset-0 flex items-center transition-all duration-700 ${i === currentSlide
                  ? 'opacity-100 translate-y-0 z-10'
                  : i < currentSlide
                    ? 'opacity-0 -translate-y-12 z-0'
                    : 'opacity-0 translate-y-12 z-0'
                }`}
            >
              <div className="max-w-7xl mx-auto w-full px-6 md:px-16">
                <div className="max-w-2xl">
                  {/* 副标题标签 */}
                  <span className="inline-block px-4 py-1.5 rounded-full bg-nexus-primary/10 border border-nexus-primary/20 text-nexus-primary text-xs font-bold mb-6 backdrop-blur-md">
                    {slide.subtitle}
                  </span>

                  {/* 主标题 — ShinyText 光泽效果 */}
                  <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-nexus-text mb-6 leading-tight">
                    <ShinyText
                      text={slide.title}
                      speed={3}
                      shineColor="var(--color-nexus-primary)"
                      color="var(--color-nexus-text)"
                      className="text-4xl md:text-6xl lg:text-7xl font-bold"
                    />
                  </h2>

                  {/* 描述 */}
                  <p className="text-nexus-muted text-lg md:text-xl leading-relaxed mb-10 max-w-lg">
                    {slide.description}
                  </p>

                  {/* CTA 按钮 */}
                  <button className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-nexus-primary/10 border border-nexus-primary/30 text-nexus-primary text-base font-bold hover:bg-nexus-primary hover:text-nexus-inverse transition-all duration-500 group/btn backdrop-blur-sm">
                    {slide.ctaText}
                    <ArrowRight size={18} className="group-hover/btn:translate-x-1.5 transition-transform duration-300" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 导航按钮 — 圆形玻璃态 */}
      <button
        onClick={prevSlide}
        className="absolute left-6 md:left-10 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-nexus-bg/30 border border-nexus-border/30 flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50 hover:bg-nexus-bg/50 transition-all duration-300 backdrop-blur-xl"
      >
        <ChevronLeft size={24} />
      </button>
      <button
        onClick={nextSlide}
        className="absolute right-6 md:right-10 top-1/2 -translate-y-1/2 z-20 w-14 h-14 rounded-full bg-nexus-bg/30 border border-nexus-border/30 flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/50 hover:bg-nexus-bg/50 transition-all duration-300 backdrop-blur-xl"
      >
        <ChevronRight size={24} />
      </button>



      {/* 底部滚动提示 */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-nexus-muted/40">
        <span className="text-xs tracking-[0.3em] uppercase">Scroll</span>
        <div className="w-px h-8 bg-gradient-to-b from-nexus-muted/40 to-transparent animate-pulse" />
      </div>
    </section>
  );
}
