import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Github, Linkedin, Twitter } from 'lucide-react';

/**
 * 关于区域 + 页脚版权组件
 * NOTE: 含品牌介绍、导航链接、社交媒体和版权信息
 */
export default function Footer() {
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
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* 关于区域 */}
      <section
        id="about"
        ref={sectionRef}
        className="relative py-28 px-6 border-t border-nexus-border/30 overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-nexus-surface/20 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-nexus-primary/[0.03] blur-[150px] rounded-full pointer-events-none" />

        <div className={`max-w-4xl mx-auto relative z-10 text-center transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
            ABOUT US
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            关于 <span className="text-gradient-primary">昆仑工坊</span>
          </h2>
          <p className="text-nexus-muted text-lg leading-relaxed max-w-2xl mx-auto mb-12">
            昆仑工坊由一群深耕跨境电商和 AI 技术的工程师于 2024 年创立。
            我们致力于通过前沿的大语言模型和自动化技术，为全球数字贸易提供最稳健的基础设施支持。
            我们相信，技术不应该是壁垒——而是赋能每一个创业者的翅膀。
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/workbench" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-nexus-primary text-nexus-inverse font-bold text-sm shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-105 active:scale-95 transition-all duration-300">
              开始免费试用
              <ArrowRight size={16} />
            </Link>
            <button className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-nexus-border text-nexus-text text-sm font-medium hover:border-nexus-primary/50 hover:text-nexus-primary transition-all duration-300">
              联系我们
            </button>
          </div>
        </div>
      </section>

      {/* 页脚版权区 */}
      <footer className="pt-20 pb-10 px-6 border-t border-nexus-border/30 bg-nexus-bg">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            {/* 品牌区 */}
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl overflow-hidden">
                  <img src="/logo.png" alt="KunLun" className="w-full h-full object-cover" />
                </div>
                <span className="font-bold text-xl tracking-wider text-nexus-text">KUNLUN</span>
              </div>
              <p className="text-nexus-muted text-sm max-w-sm leading-relaxed mb-6">
                昆仑工坊致力于通过 AI 与自动化技术，为数字贸易提供最稳健的基础设施支持。
                让每一位电商从业者都能享受到科技赋能的红利。
              </p>
              {/* 社交媒体 */}
              <div className="flex gap-3">
                {[
                  { icon: <Github size={18} />, label: 'GitHub' },
                  { icon: <Twitter size={18} />, label: 'Twitter' },
                  { icon: <Linkedin size={18} />, label: 'LinkedIn' },
                ].map((social) => (
                  <a
                    key={social.label}
                    href="#"
                    title={social.label}
                    className="w-9 h-9 rounded-lg bg-nexus-surface/50 border border-nexus-border/30 flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/40 transition-all duration-300"
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* 产品链接 */}
            <div>
              <h4 className="font-bold mb-5 text-nexus-text text-sm">产品</h4>
              <ul className="space-y-3 text-sm text-nexus-muted">
                <li><a href="#features" className="hover:text-nexus-primary transition-colors duration-300">核心功能</a></li>
                <li><a href="#tools" className="hover:text-nexus-primary transition-colors duration-300">插件市场</a></li>
                <li><Link to="/pricing" className="hover:text-nexus-primary transition-colors duration-300">定价策略</Link></li>
                <li><a href="#" className="hover:text-nexus-primary transition-colors duration-300">更新日志</a></li>
              </ul>
            </div>

            {/* 开发者链接 */}
            <div>
              <h4 className="font-bold mb-5 text-nexus-text text-sm">开发者</h4>
              <ul className="space-y-3 text-sm text-nexus-muted">
                <li>
                  <a href="#" className="hover:text-nexus-primary transition-colors duration-300">
                    API 文档
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-nexus-primary transition-colors duration-300">
                    GitHub 仓库
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-nexus-primary transition-colors duration-300 inline-flex items-center gap-1.5">
                    系统状态
                    <span className="inline-block w-2 h-2 rounded-full bg-nexus-primary animate-pulse" />
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-nexus-primary transition-colors duration-300">
                    开发者社区
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* 底部版权 */}
          <div className="pt-8 border-t border-nexus-border/30 text-sm text-nexus-muted flex flex-col md:flex-row justify-between items-center gap-4">
            <p>© 2026 KunLun Tech. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-nexus-text transition-colors duration-300">隐私政策</a>
              <a href="#" className="hover:text-nexus-text transition-colors duration-300">服务条款</a>
              <a href="#" className="hover:text-nexus-text transition-colors duration-300">Cookie 设置</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
