import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface ToolItem {
  name: string;
  category: string;
}

/**
 * 第三方工具/生态展示区
 * NOTE: 展示已对接的第三方平台和工具
 * 分类标签 + 工具网格布局，hover 时显示连接状态
 */
export default function ToolsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState('全部');
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

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const categories = ['全部', '电商', 'AI', '支付', '运营'];

  const tools: ToolItem[] = [
    { name: 'TikTok Shop', category: '电商' },
    { name: 'Shopify', category: '电商' },
    { name: 'Amazon', category: '电商' },
    { name: '拼多多', category: '电商' },
    { name: 'ChatGLM', category: 'AI' },
    { name: 'Midjourney', category: 'AI' },
    { name: 'AutoGLM', category: 'AI' },
    { name: 'Claude API', category: 'AI' },
    { name: '支付宝', category: '支付' },
    { name: 'Stripe', category: '支付' },
    { name: 'PayPal', category: '支付' },
    { name: 'ERP 系统', category: '运营' },
    { name: 'WMS 仓储', category: '运营' },
    { name: '企业微信', category: '运营' },
  ];

  const filteredTools = activeCategory === '全部'
    ? tools
    : tools.filter((t) => t.category === activeCategory);

  return (
    <section
      id="tools"
      ref={sectionRef}
      className="relative py-28 px-6 border-t border-nexus-border/30 overflow-hidden"
    >
      {/* 背景 */}
      <div className="absolute inset-0 bg-gradient-to-b from-nexus-surface/20 to-nexus-bg" />
      <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-nexus-primary/[0.02] blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* 标题 */}
        <div className={`text-center mb-16 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-primary" />
            ECOSYSTEM
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            无缝对接近百种 <span className="text-nexus-primary">生态工具</span>
          </h2>
          <p className="text-nexus-muted max-w-lg mx-auto">
            一键联通全域电商生态，让你的业务流转不再有断层。
          </p>
        </div>

        {/* 分类标签 */}
        <div className={`flex flex-wrap justify-center gap-3 mb-12 transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                activeCategory === cat
                  ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                  : 'bg-nexus-surface/50 text-nexus-muted border border-nexus-border/50 hover:border-nexus-primary/30 hover:text-nexus-text'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 工具网格 */}
        <div className="flex flex-wrap justify-center gap-4">
          {filteredTools.map((tool, i) => (
            <div
              key={tool.name}
              className={`group px-6 py-3.5 rounded-xl bg-nexus-bg/80 border border-nexus-border/40 flex items-center gap-3 hover:border-nexus-primary/40 hover:shadow-[0_0_20px_rgba(62,237,231,0.08)] transition-all duration-300 cursor-pointer ${
                isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
              style={{ transitionDelay: `${300 + i * 50}ms` }}
            >
              {/* 状态指示灯 */}
              <div className="relative w-2.5 h-2.5 rounded-full bg-nexus-secondary group-hover:bg-nexus-primary transition-colors duration-300">
                <div className="absolute inset-0 rounded-full bg-nexus-secondary group-hover:bg-nexus-primary animate-ping opacity-0 group-hover:opacity-40" />
              </div>
              <span className="text-sm font-medium text-nexus-text/80 group-hover:text-nexus-text transition-colors">
                {tool.name}
              </span>
              <ExternalLink size={12} className="text-nexus-muted/0 group-hover:text-nexus-muted/60 transition-all duration-300" />
            </div>
          ))}
        </div>

        {/* 底部提示 */}
        <p className={`text-center text-nexus-muted/60 text-xs mt-10 transition-all duration-700 delay-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
          更多第三方平台持续接入中...
        </p>
      </div>
    </section>
  );
}
