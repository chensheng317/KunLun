import React, { useEffect, useRef, useState } from 'react';

interface StatItem {
  label: string;
  value: string;
  suffix?: string;
}

/**
 * 荣誉数据统计展示区
 * NOTE: 使用 IntersectionObserver 实现数字滚入视口时的动态计数动画
 */
export default function StatsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const stats: StatItem[] = [
    { label: '纳管设备数', value: '20,000', suffix: '+' },
    { label: '日均处理订单', value: '500 万', suffix: '+' },
    { label: 'API 响应延迟', value: '< 20', suffix: 'ms' },
    { label: '系统稳定性', value: '99.99', suffix: '%' },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative py-16 border-y border-nexus-border/30 bg-nexus-bg overflow-hidden"
    >
      {/* 背景微光装饰 */}
      <div className="absolute inset-0 bg-gradient-to-r from-nexus-primary/[0.02] via-transparent to-nexus-secondary/[0.02]" />

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={`text-center relative group transition-all duration-700 ${
              isVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: `${i * 150}ms` }}
          >
            {/* 左侧分隔线（除第一项） */}
            {i > 0 && (
              <div className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-px h-12 bg-gradient-to-b from-transparent via-nexus-border/50 to-transparent" />
            )}
            <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-nexus-primary mb-3 font-mono tracking-tight">
              {stat.value}
              {stat.suffix && (
                <span className="text-nexus-secondary text-xl md:text-2xl ml-0.5">{stat.suffix}</span>
              )}
            </div>
            <div className="text-sm text-nexus-muted font-medium">{stat.label}</div>

            {/* hover 底部高亮线 */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-nexus-primary/40 rounded-full transition-all duration-500 group-hover:w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
