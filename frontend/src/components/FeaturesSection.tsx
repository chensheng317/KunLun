import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  MousePointerClick,
  Video,
  MessageCircle,
  Store,
  Share2,
  Terminal,
} from 'lucide-react';


/**
 * 核心功能矩阵展示区 — 标题居中嵌入网格 + 华容道内容交换特效
 * 布局设计（grid-template-areas）:
 *   "a  b  b"      ← 窄卡 + 宽卡
 *   "c  核心  d"    ← 窄卡 + 标题枢纽 + 窄卡
 *   "e  e  f"      ← 宽卡 + 窄卡
 *   "g  g  g"      ← 自定义口令（整行）
 *
 * 华容道：卡片壳不动，内部 icon+文字 在同尺寸卡片间淡入淡出交换
 */

interface Skill {
  icon: React.ElementType;
  title: string;
  description: string;
}

/** 6 个技能对应数字员工内置口令 */
const SKILLS: Skill[] = [
  { icon: Search, title: '爆款竞品分析', description: '深度拆解竞品爆款逻辑，生成多维分析报告。' },
  { icon: MousePointerClick, title: '模拟人类活动', description: '模拟真人浏览、点击、滑动等行为，智能规避风控检测。' },
  { icon: Video, title: '短视频数据复盘', description: '提取短视频核心数据指标，生成优化建议。' },
  { icon: MessageCircle, title: '私域微信回复', description: '根据客户画像与历史语境，生成高情商回复。' },
  { icon: Store, title: '店铺经营体检', description: '全方位扫描店铺健康度，输出风险预警报告。' },
  { icon: Share2, title: '平台内容发布', description: '一键分发多平台图文/视频内容，智能排版。' },
];

/**
 * 6 个 slot 的布局定义
 * gridArea 对应 CSS Grid 命名区域
 * group 用于华容道分组（仅同组交换）
 */
const SLOTS = [
  { gridArea: 'a', group: 'narrow' },  // 位置 0: 左上窄卡
  { gridArea: 'b', group: 'wide' },    // 位置 1: 右上宽卡
  { gridArea: 'c', group: 'narrow' },  // 位置 2: 中左窄卡
  { gridArea: 'd', group: 'narrow' },  // 位置 3: 中右窄卡
  { gridArea: 'e', group: 'wide' },    // 位置 4: 左下宽卡
  { gridArea: 'f', group: 'narrow' },  // 位置 5: 右下窄卡
];

/** 同组 slot 索引，华容道只在组内交换内容 */
const GROUPS: Record<string, number[]> = {
  wide: [1, 4],
  narrow: [0, 2, 3, 5],
};

export default function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  /** contentMap[slotIndex] = skillIndex */
  const [contentMap, setContentMap] = useState([0, 1, 2, 3, 4, 5]);

  /** 正在交换内容的两个 slot 索引 */
  const [swappingSlots, setSwappingSlots] = useState<[number, number] | null>(null);

  /** 内容交换动画阶段 */
  const [phase, setPhase] = useState<'idle' | 'fadeOut' | 'swap' | 'fadeIn'>('idle');

  /* ---- 进入视口检测 ---- */
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

  /* ---- 华容道内容交换循环 ---- */
  useEffect(() => {
    if (!isVisible) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const runCycle = () => {
      // 随机选一个组
      const groupKeys = Object.keys(GROUPS);
      const groupKey = groupKeys[Math.floor(Math.random() * groupKeys.length)];
      const groupSlots = GROUPS[groupKey];

      // 在组内随机选两个不同的 slot
      const idxA = Math.floor(Math.random() * groupSlots.length);
      let idxB = Math.floor(Math.random() * (groupSlots.length - 1));
      if (idxB >= idxA) idxB++;

      const slotA = groupSlots[idxA];
      const slotB = groupSlots[idxB];

      // ① 内容淡出
      setSwappingSlots([slotA, slotB]);
      setPhase('fadeOut');

      timeoutId = setTimeout(() => {
        // ② 交换数据（此时内容已透明）
        setPhase('swap');
        setContentMap((prev) => {
          const next = [...prev];
          [next[slotA], next[slotB]] = [next[slotB], next[slotA]];
          return next;
        });

        timeoutId = setTimeout(() => {
          // ③ 内容淡入
          setPhase('fadeIn');

          timeoutId = setTimeout(() => {
            setSwappingSlots(null);
            setPhase('idle');

            const pause = 500 + Math.random() * 500;
            timeoutId = setTimeout(runCycle, pause);
          }, 300);
        }, 50);
      }, 300);
    };

    timeoutId = setTimeout(runCycle, 2000);
    return () => clearTimeout(timeoutId);
  }, [isVisible]);

  return (
    <section
      id="features"
      ref={sectionRef}
      className="relative h-screen px-6 overflow-hidden flex flex-col justify-center"
    >
      {/* 背景装饰 */}
      <div className="absolute top-1/4 right-0 w-[800px] h-[800px] bg-nexus-surface-alt/8 blur-[200px] rounded-full pointer-events-none" />

      <div
        className={`max-w-6xl mx-auto relative z-10 w-full transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
      >
        {/*
         * 核心网格 — 标题嵌入中心，四周被卡片围绕
         * 使用 grid-template-areas 精确控制布局
         */}
        <div
          className="grid grid-cols-3 gap-4"
          style={{
            gridTemplateAreas: `
              "a b b"
              "c hub d"
              "e e f"
              "g g g"
            `,
          }}
        >
          {/* === 6 个技能卡片 slot === */}
          {SLOTS.map((slot, slotIdx) => {
            const skillIdx = contentMap[slotIdx];
            const skill = SKILLS[skillIdx];
            const Icon = skill.icon;

            const isInSwap =
              swappingSlots !== null &&
              (slotIdx === swappingSlots[0] || slotIdx === swappingSlots[1]);
            const contentOpacity =
              isInSwap && (phase === 'fadeOut' || phase === 'swap') ? 0 : 1;

            return (
              <div
                key={`slot-${slotIdx}`}
                className="group relative rounded-2xl bg-nexus-surface/50 border border-nexus-border/30 p-6 backdrop-blur-sm hover:border-nexus-primary/40 transition-all duration-300 overflow-hidden"
                style={{ gridArea: slot.gridArea }}
              >
                {/* 圆角适配的角标装饰 */}
                <div
                  className="absolute top-0 left-0 w-16 h-16 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(circle at 0% 0%, rgba(62,237,231,0.25) 0%, transparent 70%)',
                  }}
                />

                {/* 内容区 — 带淡入淡出动画 */}
                <motion.div
                  animate={{ opacity: contentOpacity }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <div className="w-11 h-11 rounded-xl bg-nexus-surface-alt/60 border border-nexus-border/30 flex items-center justify-center text-nexus-secondary mb-4 group-hover:text-nexus-primary group-hover:scale-105 transition-all duration-300">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-base font-bold text-nexus-text mb-2 group-hover:text-nexus-primary transition-colors duration-200">
                    {skill.title}
                  </h3>
                  <p className="text-nexus-muted text-xs leading-relaxed">
                    {skill.description}
                  </p>
                </motion.div>
              </div>
            );
          })}

          {/* === 中心标题枢纽 === */}
          <div
            className="relative rounded-2xl border border-nexus-border/30 p-6 flex flex-col items-center justify-center text-center overflow-hidden"
            style={{ gridArea: 'hub' }}
          >
            {/* 中心高光装饰 */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, rgba(62,237,231,0.08) 0%, transparent 70%)',
              }}
            />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-nexus-border/50 text-nexus-muted text-[10px] font-medium mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
                CORE FEATURES
              </div>
              <h2 className="text-xl md:text-2xl font-bold mb-2 leading-tight">
                为电商打造的
                <br />
                <span className="text-nexus-primary">专业手机矩阵</span>
              </h2>
              <p className="text-nexus-muted text-xs leading-relaxed">
                打破业务壁垒
                <br />
                重塑人机协作的边界
              </p>
            </div>
          </div>

          {/* === 底部自定义口令（整行） === */}
          <div
            className="group relative rounded-2xl bg-nexus-surface/50 border border-nexus-border/30 p-6 backdrop-blur-sm hover:border-nexus-primary/40 transition-all duration-300 overflow-hidden"
            style={{ gridArea: 'g' }}
          >
            <div
              className="absolute top-0 left-0 w-16 h-16 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 0% 0%, rgba(62,237,231,0.25) 0%, transparent 70%)',
              }}
            />

            <div className="flex items-center gap-6">
              <div className="w-11 h-11 rounded-xl bg-nexus-surface-alt/60 border border-nexus-border/30 flex items-center justify-center text-nexus-secondary group-hover:text-nexus-primary group-hover:scale-105 transition-all duration-300 shrink-0">
                <Terminal size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-nexus-text mb-1 group-hover:text-nexus-primary transition-colors duration-200">
                  自定义口令
                </h3>
                <p className="text-nexus-muted text-xs leading-relaxed">
                  输入自然语言指令，数字员工将智能理解语义并自动执行。支持任意复杂度的自定义任务编排。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
