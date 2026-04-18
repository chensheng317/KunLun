import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../utils/asset-url';


interface CaseStory {
  title: string;
  metric: string;
  /** 未来放置图片的 URL */
  image?: string;
}

/**
 * 成功案例展示区 — 6 列 9:16 竖版瀑布流
 * NOTE: 标题 + 副标题 + 6 列无限滚动
 * 每列交替向上/向下滚动，卡片比例 9:16（竖版，类似短视频封面）
 * 未来每张卡片内会填充图片
 * 响应式：移动端 3 列，平板 4 列，桌面 6 列
 */
export default function CasesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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

  const stories: CaseStory[] = [
    { title: '高效', metric: 'Efficient', image: assetUrl('/stream/1.jpg') },
    { title: '智能', metric: 'Intelligent', image: assetUrl('/stream/2.jpg') },
    { title: '创新', metric: 'Innovative', image: assetUrl('/stream/3.jpg') },
    { title: '精准', metric: 'Precise', image: assetUrl('/stream/4.jpg') },
    { title: '卓越', metric: 'Excellent', image: assetUrl('/stream/5.jpg') },
    { title: '极致', metric: 'Ultimate', image: assetUrl('/stream/6.jpg') },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative h-screen px-6 overflow-hidden flex flex-col justify-center"
    >
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-nexus-secondary/[0.03] blur-[150px] rounded-full pointer-events-none" />

      <div className={`max-w-7xl mx-auto relative z-10 w-full transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* 标题区 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-primary" />
            SUCCESS STORIES
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            他们正在用昆仑工坊{' '}
            <span className="text-nexus-primary">改变商业</span>
          </h2>
          <p className="text-nexus-muted max-w-lg mx-auto text-sm">
            真实案例，真实增长。看看领先企业如何借助数字中枢实现业务腾飞。
          </p>
        </div>

        {/* 瀑布流区域 — 6 列交替滚动 */}
        <div className="relative overflow-hidden" style={{ height: 'min(55vh, 460px)' }}>
          {/* 顶部/底部渐隐遮罩 */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-nexus-bg to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-nexus-bg to-transparent z-10 pointer-events-none" />

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 h-full">
            {stories.map((story, colIndex) => (
              <div key={colIndex} className="overflow-hidden relative">
                {/* 奇数列向上，偶数列向下 */}
                <div className={colIndex % 2 === 0 ? 'animate-marqueeUp' : 'animate-marqueeDown'}>
                  <div className="flex flex-col gap-3">
                    {/* 重复 3 次确保无缝循环 */}
                    {[...Array(3)].map((_, repeatIndex) => (
                      <CaseCard
                        key={`${colIndex}-${repeatIndex}`}
                        story={story}
                        colIndex={colIndex}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 单张 9:16 竖版案例卡片
 * NOTE: aspect-[9/16] 保持竖版比例
 * 未来 story.image 有值时渲染为 img 背景，否则渲染渐变占位
 */
function CaseCard({ story, colIndex }: { story: CaseStory; colIndex: number }) {
  // 每列使用不同角度的渐变色作为占位
  const gradients = [
    'from-nexus-primary/20 to-nexus-surface-alt/40',
    'from-nexus-secondary/20 to-nexus-surface/40',
    'from-nexus-primary/15 to-nexus-surface-alt/30',
    'from-nexus-secondary/15 to-nexus-surface/50',
    'from-nexus-primary/10 to-nexus-surface-alt/50',
    'from-nexus-secondary/25 to-nexus-surface/30',
  ];

  return (
    <div className="group relative rounded-xl overflow-hidden border border-nexus-border/30 hover:border-nexus-primary/40 transition-all duration-300 flex-shrink-0 aspect-[9/16]">
      {/* 图片或渐变占位 */}
      {story.image ? (
        <img
          src={story.image}
          alt={story.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradients[colIndex % gradients.length]}`} />
      )}

      {/* 底部信息叠加层 — 始终显示 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-nexus-bg/90 via-nexus-bg/50 to-transparent p-3 pt-10">
        <div className="text-nexus-primary font-bold font-mono text-base mb-1">
          {story.metric}
        </div>
        <div className="text-nexus-text text-xs font-semibold">
          {story.title}
        </div>
      </div>

      {/* hover 边框光晕 */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl ring-1 ring-inset ring-nexus-primary/30" />
    </div>
  );
}
