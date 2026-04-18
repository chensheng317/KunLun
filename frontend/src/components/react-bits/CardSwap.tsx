/**
 * CardSwap — GSAP 驱动的 3D 卡片轮换动画组件
 * 源自 React Bits (https://reactbits.dev)
 * NOTE: 卡片以 3D 透视堆叠排列，自动按间隔时间依次向下掉落并轮换到末尾
 */
import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import gsap from 'gsap';

export interface CardSwapProps {
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  onCardClick?: (idx: number) => void;
  skewAmount?: number;
  easing?: 'linear' | 'elastic';
  children: ReactNode;
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

/**
 * CardSwap 子级容器
 * NOTE: 使用 forwardRef 让父组件通过 ref 操控 DOM 实现 3D 动画
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, ...rest }, ref) => (
  <div
    ref={ref}
    {...rest}
    className={`absolute top-0 left-0 rounded-xl border border-nexus-border/50 bg-nexus-surface/90 backdrop-blur-sm [transform-style:preserve-3d] [will-change:transform] [backface-visibility:hidden] ${customClass ?? ''} ${rest.className ?? ''}`.trim()}
  />
));
Card.displayName = 'Card';

interface Slot {
  x: number;
  y: number;
  z: number;
  zIndex: number;
}

/** 计算第 i 张卡片在 3D 空间中的位置和层级 */
const makeSlot = (i: number, distX: number, distY: number, total: number): Slot => ({
  x: i * distX,
  y: -i * distY,
  z: -i * distX * 1.5,
  zIndex: total - i
});

/** 立即将元素放置到目标 slot 位置（无动画） */
const placeNow = (el: HTMLElement, slot: Slot, skew: number) =>
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    skewY: skew,
    transformOrigin: 'center center',
    zIndex: slot.zIndex,
    force3D: true
  });

const CardSwap: React.FC<CardSwapProps> = ({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  pauseOnHover = false,
  onCardClick,
  skewAmount = 6,
  easing = 'elastic',
  children
}) => {
  // NOTE: elastic 模式动画更有弹性，linear 模式更平滑
  const config = useMemo(() =>
    easing === 'elastic'
      ? {
          ease: 'elastic.out(0.6,0.9)',
          durDrop: 2,
          durMove: 2,
          durReturn: 2,
          promoteOverlap: 0.9,
          returnDelay: 0.05
        }
      : {
          ease: 'power1.inOut',
          durDrop: 0.8,
          durMove: 0.8,
          durReturn: 0.8,
          promoteOverlap: 0.45,
          returnDelay: 0.2
        },
    [easing]
  );

  const childArr = useMemo(() => Children.toArray(children) as ReactElement<CardProps>[], [children]);
  const total = childArr.length;

  // NOTE: 使用 callback ref 模式收集所有卡片 DOM 引用，确保渲染后 ref 可用
  const cardRefs = useRef<(HTMLDivElement | null)[]>(new Array(total).fill(null));
  const orderRef = useRef<number[]>(Array.from({ length: total }, (_, i) => i));
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const intervalRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  /** 将 swap 函数暴露给点击事件使用 */
  const swapRef = useRef<(() => void) | null>(null);
  /** 防止动画冲突的锁 */
  const isAnimatingRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // 收集 ref 的回调
  const setCardRef = useCallback((idx: number) => (el: HTMLDivElement | null) => {
    cardRefs.current[idx] = el;
    // 所有 ref 收集完毕后标记 mounted
    if (el && cardRefs.current.every(r => r !== null)) {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const els = cardRefs.current as HTMLDivElement[];
    // 初始化位置
    els.forEach((el, i) => placeNow(el, makeSlot(i, cardDistance, verticalDistance, total), skewAmount));

    const swap = () => {
      // NOTE: 动画进行中时跳过，防止点击过快导致动画冲突
      if (isAnimatingRef.current) return;
      if (orderRef.current.length < 2) return;

      const [front, ...rest] = orderRef.current;
      const elFront = els[front];
      if (!elFront) return;

      isAnimatingRef.current = true;
      const tl = gsap.timeline({
        onComplete: () => { isAnimatingRef.current = false; }
      });
      tlRef.current = tl;

      /**
       * NOTE: 丝滑抽卡动画 — 三阶段
       * 1) 顶部卡片向左滑出 + 轻微旋转 + 淡出
       * 2) 其余卡片向前递进填补空位
       * 3) 抽出的卡片从下方弧线回到末尾位置
       */

      // 第一步：向左抽出（带轻微旋转和透明度变化）
      tl.to(elFront, {
        x: '-=350',
        y: '+=30',
        rotation: -8,
        opacity: 0,
        scale: 0.92,
        duration: config.durDrop * 0.7,
        ease: 'power2.in'
      });

      // 第二步：后面的卡片依次向前递进
      tl.addLabel('promote', `-=${config.durDrop * 0.3}`);
      rest.forEach((idx, i) => {
        const el = els[idx];
        if (!el) return;
        const slot = makeSlot(i, cardDistance, verticalDistance, total);
        tl.set(el, { zIndex: slot.zIndex }, 'promote');
        tl.to(
          el,
          {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            duration: config.durMove,
            ease: config.ease
          },
          `promote+=${i * 0.1}`
        );
      });

      // 第三步：抽出的卡片回到末尾（先瞬移到右侧不可见区域，再弧线滑入）
      const backSlot = makeSlot(total - 1, cardDistance, verticalDistance, total);
      tl.addLabel('return', `promote+=${config.durMove * 0.15}`);

      // 瞬间重置到右侧偏移位置（不可见状态）
      tl.call(
        () => {
          gsap.set(elFront, {
            x: backSlot.x + 200,
            y: backSlot.y + 60,
            z: backSlot.z,
            rotation: 5,
            opacity: 0,
            scale: 0.9,
            zIndex: backSlot.zIndex
          });
        },
        undefined,
        'return'
      );

      // 从右侧弧线滑入末尾位置
      tl.to(
        elFront,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          rotation: 0,
          opacity: 1,
          scale: 1,
          duration: config.durReturn * 0.8,
          ease: 'power2.out'
        },
        `return+=0.05`
      );

      tl.call(() => {
        orderRef.current = [...rest, front];
      });
    };

    // NOTE: 暴露 swap 给 click 事件使用
    swapRef.current = swap;

    // NOTE: 初始立即执行一次，然后启动定时器
    const initTimer = window.setTimeout(() => {
      swap();
      intervalRef.current = window.setInterval(swap, delay);
    }, 300);

    if (pauseOnHover && containerRef.current) {
      const node = containerRef.current;
      const pause = () => {
        tlRef.current?.pause();
        clearInterval(intervalRef.current);
      };
      const resume = () => {
        tlRef.current?.play();
        intervalRef.current = window.setInterval(swap, delay);
      };
      node.addEventListener('mouseenter', pause);
      node.addEventListener('mouseleave', resume);
      return () => {
        node.removeEventListener('mouseenter', pause);
        node.removeEventListener('mouseleave', resume);
        clearTimeout(initTimer);
        clearInterval(intervalRef.current);
        tlRef.current?.kill();
      };
    }
    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalRef.current);
      tlRef.current?.kill();
    };
  }, [mounted, cardDistance, verticalDistance, delay, pauseOnHover, skewAmount, config, total]);

  /**
   * 点击卡片时：终止当前动画 → 立即执行 swap → 重置自动轮播计时器
   * NOTE: 实现无需等待的快速切换
   */
  const handleCardClick = useCallback((i: number, child: ReactElement<CardProps>) => {
    return (e: React.MouseEvent<HTMLDivElement>) => {
      child.props.onClick?.(e);
      onCardClick?.(i);

      // 终止当前动画并立即触发下一次 swap
      if (swapRef.current && !isAnimatingRef.current) {
        tlRef.current?.kill();
        isAnimatingRef.current = false;

        // 重置自动轮播计时器
        clearInterval(intervalRef.current);
        swapRef.current();
        intervalRef.current = window.setInterval(() => swapRef.current?.(), delay);
      }
    };
  }, [onCardClick, delay]);

  const rendered = childArr.map((child, i) =>
    isValidElement<CardProps>(child)
      ? cloneElement(child, {
          key: i,
          ref: setCardRef(i),
          style: { width, height, cursor: 'pointer', ...(child.props.style ?? {}) },
          onClick: handleCardClick(i, child)
        } as CardProps & React.RefAttributes<HTMLDivElement>)
      : child
  );

  return (
    <div
      ref={containerRef}
      className="relative perspective-[900px] overflow-visible"
      style={{ width, height }}
    >
      {rendered}
    </div>
  );
};

export default CardSwap;
