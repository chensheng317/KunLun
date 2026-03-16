import React, { useEffect, useRef, useState } from 'react';
import {
  Cpu, Workflow, Database, ShieldCheck, Box, Globe,
} from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

/**
 * 核心功能矩阵展示区
 * NOTE: 每张卡片采用悬浮光晕效果和图标缩放动画
 * 使用 IntersectionObserver 实现交错入场
 */
export default function FeaturesSection() {
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

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const features: Feature[] = [
    {
      icon: <Cpu size={24} />,
      title: 'AutoGLM 深度融合',
      description: '原生接入最新一代大语言模型，将复杂的电商运营流程转化为简单的自然语言对话。',
    },
    {
      icon: <Workflow size={24} />,
      title: '全域自动化链路',
      description: '从商品上架到多平台分发，从客服接待到售后拦截，全链路节点自动化流转。',
    },
    {
      icon: <Database size={24} />,
      title: '高可用数据中台',
      description: '工业级的数据清洗与沉淀能力，实时生成多维报表，告别数据盲区。',
    },
    {
      icon: <ShieldCheck size={24} />,
      title: '合规与风控矩阵',
      description: '内置数十种行业合规校验规则，敏感词、侵权风险在发布前自动熔断。',
    },
    {
      icon: <Box size={24} />,
      title: '模块化插件架构',
      description: '采用微前端架构，需要什么功能就安装什么插件，保持控制台极致纯粹。',
    },
    {
      icon: <Globe size={24} />,
      title: '多平台云端同步',
      description: '一次配置，多端生效。无论你身在何处，数字中枢始终与你保持极速同步。',
    },
  ];

  return (
    <section id="features" ref={sectionRef} className="relative py-28 px-6 overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-nexus-surface-alt/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-nexus-primary/[0.02] blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* 标题区 */}
        <div className={`text-center mb-20 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
            CORE FEATURES
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-5">
            为电商打造的 <span className="text-nexus-primary">专业级</span> 工具矩阵
          </h2>
          <p className="text-nexus-muted max-w-lg mx-auto text-lg">
            打破业务壁垒，重塑人机协作的边界。
          </p>
        </div>

        {/* 功能卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={i}
              className={`group relative p-8 rounded-2xl bg-nexus-surface/60 backdrop-blur-sm border border-nexus-border/50 hover:border-nexus-primary/40 transition-all duration-500 cursor-default ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${200 + i * 100}ms` }}
            >
              {/* 悬停光晕 */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-nexus-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] pointer-events-none" />

              {/* 图标 */}
              <div className="relative w-14 h-14 rounded-xl bg-nexus-surface-alt/80 border border-nexus-border/30 flex items-center justify-center text-nexus-secondary mb-7 group-hover:text-nexus-primary group-hover:scale-110 group-hover:shadow-cyber-glow transition-all duration-400">
                {feature.icon}
              </div>

              {/* 内容 */}
              <h3 className="relative text-xl font-bold text-nexus-text mb-3 group-hover:text-nexus-primary transition-colors duration-300">
                {feature.title}
              </h3>
              <p className="relative text-nexus-muted text-sm leading-relaxed">
                {feature.description}
              </p>

              {/* 角落装饰点 */}
              <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-nexus-border/50 group-hover:bg-nexus-primary/50 transition-colors duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
