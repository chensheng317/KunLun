import { useState, useEffect, useRef } from 'react';

import CardSwap, { Card } from './react-bits/CardSwap';

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * 常见问题 (FAQ) 区块 — 左侧标题 + 右侧 CardSwap
 * NOTE: 标题样式与其他 section 统一（text-2xl md:text-3xl）
 * 移除 ScrollReveal 滚动动画，只保留简洁的 IntersectionObserver 入场
 */
export default function FaqSection() {
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
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const faqs: FaqItem[] = [
    {
      question: '昆仑工坊适合哪些人群或企业？',
      answer: '昆仑工坊面向电商从业者与企业，核心覆盖电商OPC、中小微电商、互联网电商、自媒体电商，同时支持个人卖家、工作室、电商创业者等用户，以低门槛、全流程的AI能力，满足不同规模主体的电商运营需求。',
    },
    {
      question: 'AI手机团队能做什么？',
      answer: 'AI手机团队是昆仑工坊的核心自动化能力，可通过自然语言交互，自动执行电商全流程任务，包含爆款竞品分析、模拟人类活动、短视频数据复盘、私域微信回复、店铺经营体检、平台内容发布等，支持用户自定义专属指令，实现7×24小时无人值守的自动化运营。',
    },
    {
      question: '数据安全如何保障？',
      answer: '采用三层架构联防保证数据安全，应用层使用单向哈希、日志脱敏；数据库层采用脱敏视图、字段加密；传输层采用CORS收紧、速率限制。',
    },
    {
      question: '平台产品的定价？',
      answer: '昆仑工坊采用SaaS订阅+按需增值的模式，同时支持企业定制化，方案包括体验版、基础版、专业版、旗舰版。',
    },
    {
      question: '六大定制服务是什么？',
      answer: '昆仑工坊为企业用户提供六大核心定制服务，包括内容创作服务、RPA开发服务、工作流搭建服务、智能体开发服务、Phone Agent团队开发服务、基建管理服务。',
    },
  ];

  return (
    <section
      id="faq"
      ref={sectionRef}
      className="relative h-screen px-6 overflow-hidden border-t border-nexus-border/30 flex flex-col justify-center"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-nexus-primary/[0.02] blur-[100px] rounded-full pointer-events-none" />

      <div className={`max-w-6xl mx-auto relative z-10 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

          {/* 标题区 — 上方居中，与其他 section 统一 */}
          <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
                FAQ
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-3">
                常见<span className="text-nexus-primary">问题</span>
              </h2>
              <p className="text-nexus-muted max-w-lg mx-auto text-sm">
                还有疑问？随时通过工作台帮助文档/联系客服获取帮助。
              </p>
          </div>

          {/* CardSwap — 下方居中 */}
          <div className="flex justify-center pt-24 pb-4">
              <CardSwap
                cardDistance={20}
                verticalDistance={25}
                delay={5000}
                pauseOnHover={true}
                width={768}
                height={200}
                skewAmount={3}
                easing="elastic"
              >
                {faqs.map((faq, i) => (
                  <Card key={i}>
                    <div className="p-6 flex flex-col justify-between h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-nexus-primary/10 text-nexus-primary text-xs font-bold border border-nexus-primary/20">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="flex-1 h-px bg-gradient-to-r from-nexus-primary/30 to-transparent" />
                      </div>
                      <h3 className="text-nexus-text font-semibold text-sm mb-2 leading-snug">
                        {faq.question}
                      </h3>
                      <p className="text-nexus-muted text-xs leading-relaxed flex-1 line-clamp-4">
                        {faq.answer}
                      </p>
                    </div>
                  </Card>
                ))}
              </CardSwap>
          </div>

      </div>
    </section>
  );
}
