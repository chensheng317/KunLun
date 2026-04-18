import { useEffect, useMemo, useRef, useState } from 'react';

import Hyperspeed from './react-bits/Hyperspeed';

interface ToolItem {
  name: string;
  category: string;
}

/**
 * 第三方工具/生态展示区
 * NOTE: Hyperspeed WebGL 背景 + 无限滚动工具 Logo Loop
 * 标题样式与其他 section 统一
 */
export default function ToolsSection() {
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

  // NOTE: 项目实际使用的第三方生态工具 — 基于 backend/.env 和各模块接入的真实服务
  const tools: ToolItem[] = [
    { name: '智谱 AutoGLM', category: 'AI' },
    { name: 'Coze 智能体', category: 'AI' },
    { name: 'MiniMax', category: 'AI' },
    { name: 'Mureka', category: 'AI' },
    { name: '即梦 · 火山引擎', category: 'AI' },
    { name: 'RunningHub', category: '工作流' },
    { name: 'ComfyUI', category: '工作流' },
    { name: '抖音', category: '平台' },
    { name: '小红书', category: '平台' },
    { name: '快手', category: '平台' },
    { name: '微信', category: '平台' },
    { name: '火山引擎 TOS', category: '基础设施' },
    { name: 'Open-AutoGLM', category: 'AI' },
    { name: 'FFmpeg', category: '工具' },
  ];

  const loopTools = [...tools, ...tools];

  /**
   * NOTE: effectOptions 必须用 useMemo 稳定化引用
   * 避免父组件重渲染时创建新对象导致 WebGL 重建
   */
  const hyperspeedOptions = useMemo(() => ({
    distortion: 'turbulentDistortion' as const,
    length: 400,
    roadWidth: 10,
    islandWidth: 2,
    lanesPerRoad: 3,
    fov: 90,
    fovSpeedUp: 150,
    speedUp: 2,
    carLightsFade: 0.4,
    totalSideLightSticks: 20,
    lightPairsPerRoadWay: 40,
    shoulderLinesWidthPercentage: 0.05,
    brokenLinesWidthPercentage: 0.1,
    brokenLinesLengthPercentage: 0.5,
    lightStickWidth: [0.12, 0.5] as [number, number],
    lightStickHeight: [1.3, 1.7] as [number, number],
    movingAwaySpeed: [60, 80] as [number, number],
    movingCloserSpeed: [-120, -160] as [number, number],
    carLightsLength: [400 * 0.03, 400 * 0.2] as [number, number],
    carLightsRadius: [0.05, 0.14] as [number, number],
    carWidthPercentage: [0.3, 0.5] as [number, number],
    carShiftX: [-0.8, 0.8] as [number, number],
    carFloorSeparation: [0, 5] as [number, number],
    colors: {
      roadColor: 0x161823,
      islandColor: 0x2D2B38,
      background: 0x161823,
      shoulderLines: 0x3A3F58,
      brokenLines: 0x3A3F58,
      leftCars: [0x3eede7, 0x5EB8AC, 0x3eede7],
      rightCars: [0x3eede7, 0x5EB8AC, 0x3eede7],
      sticks: 0x3eede7
    }
  }), []);

  return (
    <section
      id="tools"
      ref={sectionRef}
      className="relative h-screen px-6 border-t border-nexus-border/30 overflow-hidden flex flex-col justify-center"
    >
      {/* Hyperspeed WebGL 背景 */}
      <div className="absolute inset-0 z-0 opacity-60">
        <Hyperspeed effectOptions={hyperspeedOptions} />
      </div>

      {/* 渐变遮罩 */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-nexus-bg to-transparent z-[1] pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-nexus-bg to-transparent z-[1] pointer-events-none" />

      <div className={`max-w-6xl mx-auto relative z-10 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* 标题区 — 统一样式 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-primary" />
            ECOSYSTEM
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            无缝对接最前沿、最实用的{' '}
            <span className="text-nexus-primary">生态工具</span>
          </h2>
          <p className="text-nexus-muted max-w-lg mx-auto text-sm">
            一键联通全域电商生态，让你的业务流转不再有断层。
          </p>
        </div>

        {/* Logo Loop — 无限滚动工具条 */}
        <div className="relative overflow-hidden mb-8">
          <div className="flex gap-4 animate-logoLoop">
            {loopTools.map((tool, i) => (
              <div
                key={`loop-${i}`}
                className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-nexus-surface/40 border border-nexus-border/30 flex items-center gap-2.5 hover:border-nexus-primary/40 hover:shadow-[0_0_20px_rgba(62,237,231,0.08)] transition-all duration-300 backdrop-blur-sm"
              >
                <div className="w-2 h-2 rounded-full bg-nexus-secondary" />
                <span className="text-sm font-medium text-nexus-text/80 whitespace-nowrap">
                  {tool.name}
                </span>
              </div>
            ))}
          </div>
          {/* 左右渐隐遮罩 */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-nexus-bg to-transparent pointer-events-none z-10" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-nexus-bg to-transparent pointer-events-none z-10" />
        </div>

        <p className="text-center text-nexus-muted/60 text-xs">
          更多第三方平台持续接入中...
        </p>
      </div>
    </section>
  );
}
