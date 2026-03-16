import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Minus } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * 常见问题 (FAQ) 折叠面板组件
 * NOTE: 使用手风琴模式，同一时间只展开一个问题
 * 展开/收起带有平滑过渡动画
 */
export default function FaqSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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

  const faqs: FaqItem[] = [
    {
      question: '昆仑工坊适合什么类型的电商企业？',
      answer: '昆仑工坊专为中小型到中型规模的跨境电商企业设计，特别适合需要同时管理多个平台（如 TikTok Shop、Shopify、Amazon 等）的卖家。无论你是独立站卖家还是平台卖家，都能通过我们的自动化链路显著提升运营效率。',
    },
    {
      question: 'AutoGLM 是什么？它如何帮助我的业务？',
      answer: 'AutoGLM 是昆仑工坊深度集成的新一代大语言模型。它支持自然语言指令驱动业务操作，你可以通过简单的文字对话完成商品上架、数据分析、客服自动回复等复杂操作，无需编码或手动操作后台。',
    },
    {
      question: '数据安全如何保障？',
      answer: '我们采用银行级别的数据加密标准（AES-256），所有数据传输均通过 TLS 1.3 加密。同时，我们通过了 ISO 27001 和 SOC2 Type II 安全认证，确保你的商业数据受到最严格的保护。',
    },
    {
      question: '免费试用期是多长？',
      answer: '新用户享有 14 天完整功能免费试用期，无需绑定信用卡。试用期内你可以体验所有核心功能，包括 AutoGLM 对话、多平台同步和数据看板。试用期结束后，可根据业务需求选择合适的套餐继续使用。',
    },
    {
      question: '是否支持 API 对接和自定义开发？',
      answer: '支持。昆仑工坊提供完整的 RESTful API 文档和 SDK，支持 Python、Node.js、Java 等主流语言。我们的插件架构也允许你开发自定义模块，满足特殊业务场景需求。企业版还提供专属技术支持和定制开发服务。',
    },
  ];

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      id="faq"
      ref={sectionRef}
      className="relative py-28 px-6 overflow-hidden border-t border-nexus-border/30"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-nexus-primary/[0.02] blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* 标题 */}
        <div className={`text-center mb-16 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
            FAQ
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-nexus-primary">常见</span>问题
          </h2>
          <p className="text-nexus-muted">
            还有疑问？随时通过工作台内置的 AI 助手获取实时帮助。
          </p>
        </div>

        {/* FAQ 列表 */}
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className={`rounded-xl border overflow-hidden transition-all duration-500 ${
                openIndex === i
                  ? 'border-nexus-primary/30 bg-nexus-surface/40 shadow-[0_0_20px_rgba(62,237,231,0.05)]'
                  : 'border-nexus-border/40 bg-nexus-surface/20 hover:border-nexus-border/60'
              } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: `${200 + i * 80}ms` }}
            >
              <button
                onClick={() => toggleFaq(i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
              >
                <span className={`text-sm font-semibold transition-colors duration-300 pr-4 ${
                  openIndex === i ? 'text-nexus-primary' : 'text-nexus-text'
                }`}>
                  {faq.question}
                </span>
                <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-300 ${
                  openIndex === i
                    ? 'bg-nexus-primary/20 text-nexus-primary rotate-0'
                    : 'bg-nexus-border/30 text-nexus-muted rotate-0'
                }`}>
                  {openIndex === i ? <Minus size={14} /> : <Plus size={14} />}
                </div>
              </button>

              <div className={`transition-all duration-400 ease-in-out overflow-hidden ${
                openIndex === i ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
              }`}>
                <div className="px-6 pb-5 text-nexus-muted text-sm leading-relaxed border-t border-nexus-border/20 pt-4">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
