import React, { useState, useEffect, useRef } from 'react';
import { Award, TrendingUp, Users, Star } from 'lucide-react';

interface CaseItem {
  title: string;
  metric: string;
  metricLabel: string;
  description: string;
  tags: string[];
}

/**
 * 案例展示区
 * NOTE: 展示客户成功案例和成就
 * 带有数据高亮和标签分类
 */
export default function CasesSection() {
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
      { threshold: 0.15 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const cases: CaseItem[] = [
    {
      title: '跨境服装品牌 SkyThread',
      metric: '+340%',
      metricLabel: '订单转化率提升',
      description: '通过昆仑工坊的全域自动化链路，将商品同步至 TikTok Shop 和 Shopify，配合 AI 智能定价策略，3 个月内实现销售额翻倍。',
      tags: ['TikTok', 'Shopify', 'AI 定价'],
    },
    {
      title: '3C 数码供应链 NexTech',
      metric: '-65%',
      metricLabel: '运营人力成本降低',
      description: '接入 AutoGLM 自然语言指令系统后，日均处理 2000+ 笔订单的客服团队从 15 人缩减至 5 人，效率提升显著。',
      tags: ['AutoGLM', '客服自动化', 'ERP'],
    },
    {
      title: '美妆品牌 GlowUp',
      metric: '99.7%',
      metricLabel: '合规通过率',
      description: '启用智能风控矩阵后，新品上架的合规检测从人工 2 天缩短至自动 3 秒，侵权风险拦截准确率达 99.7%。',
      tags: ['风控矩阵', '合规检测', '自动化'],
    },
  ];

  const honors = [
    { icon: <Award size={20} />, text: '2025 中国 SaaS 创新力 TOP 20' },
    { icon: <TrendingUp size={20} />, text: '连续 4 季度年增长 200%+' },
    { icon: <Users size={20} />, text: '服务超过 5000 家电商企业' },
    { icon: <Star size={20} />, text: 'Gartner 新锐科技供应商' },
  ];

  return (
    <section ref={sectionRef} className="relative py-28 px-6 overflow-hidden">
      {/* 背景 */}
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-nexus-secondary/[0.03] blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* 标题 */}
        <div className={`text-center mb-20 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-primary" />
            SUCCESS STORIES
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            他们正在用昆仑工坊 <span className="text-nexus-primary">改变商业</span>
          </h2>
          <p className="text-nexus-muted max-w-lg mx-auto">
            真实案例，真实增长。看看领先企业如何借助数字中枢实现业务腾飞。
          </p>
        </div>

        {/* 案例卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {cases.map((item, i) => (
            <div
              key={i}
              className={`group relative p-8 rounded-2xl bg-nexus-surface/40 border border-nexus-border/40 hover:border-nexus-primary/30 transition-all duration-500 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${200 + i * 150}ms` }}
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-nexus-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* 核心指标 */}
              <div className="relative mb-6">
                <div className="text-4xl font-bold text-nexus-primary font-mono mb-1">
                  {item.metric}
                </div>
                <div className="text-xs text-nexus-muted font-medium">{item.metricLabel}</div>
              </div>

              {/* 案例标题 */}
              <h3 className="relative text-lg font-bold text-nexus-text mb-3">{item.title}</h3>
              <p className="relative text-nexus-muted text-sm leading-relaxed mb-6">{item.description}</p>

              {/* 标签 */}
              <div className="relative flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-md bg-nexus-bg/60 border border-nexus-border/30 text-xs text-nexus-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 荣誉徽章 */}
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-all duration-700 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {honors.map((honor, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl bg-nexus-surface/30 border border-nexus-border/30"
            >
              <div className="text-nexus-secondary shrink-0">{honor.icon}</div>
              <span className="text-xs text-nexus-muted leading-snug">{honor.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
