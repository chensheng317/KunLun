import { useEffect, useRef, useCallback, useMemo } from 'react';
import { gsap } from 'gsap';

export interface TargetCursorProps {
  targetSelector?: string;
  spinDuration?: number;
  hideDefaultCursor?: boolean;
  hoverDuration?: number;
  parallaxOn?: boolean;
  /** 外部重置信号 — 值变化时自动释放当前锁定目标并重置光标四角 */
  resetKey?: string | number;
}

/**
 * TargetCursor — 瞄准镜风格自定义光标组件
 * NOTE: 仅在桌面端生效，移动端自动隐藏
 * 光标由中心点 + 四角 L 型边框构成，hover 到 targetSelector 元素时
 * 四角会自动吸附到目标元素的四个角落，形成锁定瞄准效果
 * 配色使用昆仑主题碧蓝 var(--color-nexus-primary) 作为光标边框颜色
 */
const TargetCursor: React.FC<TargetCursorProps> = ({
  targetSelector = '.cursor-target',
  spinDuration = 2,
  hideDefaultCursor = true,
  hoverDuration = 0.2,
  parallaxOn = true,
  resetKey,
}) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<NodeListOf<HTMLDivElement> | null>(null);
  const spinTl = useRef<gsap.core.Timeline | null>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  const isActiveRef = useRef(false);
  const targetCornerPositionsRef = useRef<{ x: number; y: number }[] | null>(null);
  const tickerFnRef = useRef<(() => void) | null>(null);
  const activeStrengthRef = useRef({ current: 0 });
  /** MutationObserver 实例引用，用于监听锁定元素被 DOM 移除 */
  const observerRef = useRef<MutationObserver | null>(null);
  /**
   * NOTE: forceResetRef 暴露给 resetKey useEffect，
   * 允许外部信号驱动清理而不依赖 useEffect 闭包里的 activeTarget
   */
  const forceResetRef = useRef<(() => void) | null>(null);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    const isMobileUserAgent = mobileRegex.test(userAgent.toLowerCase());
    return (hasTouchScreen && isSmallScreen) || isMobileUserAgent;
  }, []);

  const constants = useMemo(() => ({ borderWidth: 3, cornerSize: 12 }), []);

  const moveCursor = useCallback((x: number, y: number) => {
    if (!cursorRef.current) return;
    gsap.to(cursorRef.current, { x, y, duration: 0.1, ease: 'power3.out' });
  }, []);

  useEffect(() => {
    if (isMobile || !cursorRef.current) return;

    const originalCursor = document.body.style.cursor;
    if (hideDefaultCursor) {
      document.body.style.cursor = 'none';
    }

    const cursor = cursorRef.current;
    cornersRef.current = cursor.querySelectorAll<HTMLDivElement>('.target-cursor-corner');

    let activeTarget: Element | null = null;
    let currentLeaveHandler: (() => void) | null = null;
    let resumeTimeout: ReturnType<typeof setTimeout> | null = null;

    const cleanupTarget = (target: Element) => {
      if (currentLeaveHandler) {
        target.removeEventListener('mouseleave', currentLeaveHandler);
      }
      currentLeaveHandler = null;
    };

    /** 停止 MutationObserver 监听 */
    const stopObserver = () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };

    /**
     * forceReset — 强制释放当前锁定目标并重置光标四角
     * NOTE: 被三处调用：leaveHandler / MutationObserver回调 / resetKey变化
     */
    const forceReset = () => {
      if (tickerFnRef.current) {
        gsap.ticker.remove(tickerFnRef.current);
      }
      isActiveRef.current = false;
      targetCornerPositionsRef.current = null;
      gsap.set(activeStrengthRef.current, { current: 0, overwrite: true });

      if (activeTarget) {
        cleanupTarget(activeTarget);
        activeTarget = null;
      }

      stopObserver();

      // 四角归位
      if (cornersRef.current) {
        const cls = Array.from(cornersRef.current);
        gsap.killTweensOf(cls);
        const { cornerSize: cs } = constants;
        const positions = [
          { x: -cs * 1.5, y: -cs * 1.5 },
          { x: cs * 0.5, y: -cs * 1.5 },
          { x: cs * 0.5, y: cs * 0.5 },
          { x: -cs * 1.5, y: cs * 0.5 },
        ];
        cls.forEach((corner, index) => {
          gsap.to(corner, {
            x: positions[index].x,
            y: positions[index].y,
            duration: 0.3,
            ease: 'power3.out',
          });
        });
      }

      // 恢复旋转动画
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
      }
      resumeTimeout = setTimeout(() => {
        if (!activeTarget && cursorRef.current && spinTl.current) {
          const currentRotation = gsap.getProperty(cursorRef.current, 'rotation') as number;
          const normalizedRotation = currentRotation % 360;
          spinTl.current.kill();
          spinTl.current = gsap
            .timeline({ repeat: -1 })
            .to(cursorRef.current, {
              rotation: '+=360',
              duration: spinDuration,
              ease: 'none',
            });
          gsap.to(cursorRef.current, {
            rotation: normalizedRotation + 360,
            duration: spinDuration * (1 - normalizedRotation / 360),
            ease: 'none',
            onComplete: () => {
              spinTl.current?.restart();
            },
          });
        }
        resumeTimeout = null;
      }, 50);
    };

    // 暴露 forceReset 供 resetKey useEffect 调用
    forceResetRef.current = forceReset;

    /**
     * MutationObserver — 兜底监听锁定元素从 DOM 中被移除
     * NOTE: 覆盖弹窗关闭、条件渲染消失、列表项删除等非 mouseleave 场景
     */
    const startObserver = (target: Element) => {
      stopObserver();
      observerRef.current = new MutationObserver(() => {
        if (!document.body.contains(target)) {
          forceReset();
        }
      });
      // 监听整个 body 的子树变化即可
      observerRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      });
    };

    gsap.set(cursor, {
      xPercent: -50,
      yPercent: -50,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const createSpinTimeline = () => {
      if (spinTl.current) {
        spinTl.current.kill();
      }
      spinTl.current = gsap
        .timeline({ repeat: -1 })
        .to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    };

    createSpinTimeline();

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cursorRef.current || !cornersRef.current) {
        return;
      }
      const strength = activeStrengthRef.current.current;
      if (strength === 0) return;
      const cursorX = gsap.getProperty(cursorRef.current, 'x') as number;
      const cursorY = gsap.getProperty(cursorRef.current, 'y') as number;
      const corners = Array.from(cornersRef.current);
      corners.forEach((corner, i) => {
        const currentX = gsap.getProperty(corner, 'x') as number;
        const currentY = gsap.getProperty(corner, 'y') as number;
        const targetX = targetCornerPositionsRef.current![i].x - cursorX;
        const targetY = targetCornerPositionsRef.current![i].y - cursorY;
        const finalX = currentX + (targetX - currentX) * strength;
        const finalY = currentY + (targetY - currentY) * strength;
        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05;
        gsap.to(corner, {
          x: finalX,
          y: finalY,
          duration: duration,
          ease: duration === 0 ? 'none' : 'power1.out',
          overwrite: 'auto',
        });
      });
    };

    tickerFnRef.current = tickerFn;

    const moveHandler = (e: MouseEvent) => moveCursor(e.clientX, e.clientY);
    window.addEventListener('mousemove', moveHandler);

    const scrollHandler = () => {
      if (!activeTarget || !cursorRef.current) return;
      const mouseX = gsap.getProperty(cursorRef.current, 'x') as number;
      const mouseY = gsap.getProperty(cursorRef.current, 'y') as number;
      const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);
      const isStillOverTarget =
        elementUnderMouse &&
        (elementUnderMouse === activeTarget ||
          elementUnderMouse.closest(targetSelector) === activeTarget);
      if (!isStillOverTarget) {
        currentLeaveHandler?.();
      }
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });

    const mouseDownHandler = () => {
      if (!dotRef.current) return;
      gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 });
      gsap.to(cursorRef.current, { scale: 0.9, duration: 0.2 });
    };

    const mouseUpHandler = () => {
      if (!dotRef.current) return;
      gsap.to(dotRef.current, { scale: 1, duration: 0.3 });
      gsap.to(cursorRef.current, { scale: 1, duration: 0.2 });
    };

    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mouseup', mouseUpHandler);

    const enterHandler = (e: MouseEvent) => {
      const directTarget = e.target as Element;
      const allTargets: Element[] = [];
      let current: Element | null = directTarget;
      while (current && current !== document.body) {
        if (current.matches(targetSelector)) {
          allTargets.push(current);
        }
        current = current.parentElement;
      }
      const target = allTargets[0] || null;
      if (!target || !cursorRef.current || !cornersRef.current) return;
      if (activeTarget === target) return;
      if (activeTarget) {
        cleanupTarget(activeTarget);
      }
      if (resumeTimeout) {
        clearTimeout(resumeTimeout);
        resumeTimeout = null;
      }

      activeTarget = target;
      // 启动 MutationObserver 监听当前锁定目标是否被 DOM 移除
      startObserver(target);
      const corners = Array.from(cornersRef.current);
      corners.forEach((corner) => gsap.killTweensOf(corner));
      gsap.killTweensOf(cursorRef.current, 'rotation');
      spinTl.current?.pause();
      gsap.set(cursorRef.current, { rotation: 0 });

      const rect = target.getBoundingClientRect();
      const { borderWidth, cornerSize } = constants;
      const cursorX = gsap.getProperty(cursorRef.current, 'x') as number;
      const cursorY = gsap.getProperty(cursorRef.current, 'y') as number;

      targetCornerPositionsRef.current = [
        { x: rect.left - borderWidth, y: rect.top - borderWidth },
        { x: rect.right + borderWidth - cornerSize, y: rect.top - borderWidth },
        {
          x: rect.right + borderWidth - cornerSize,
          y: rect.bottom + borderWidth - cornerSize,
        },
        { x: rect.left - borderWidth, y: rect.bottom + borderWidth - cornerSize },
      ];

      isActiveRef.current = true;
      gsap.ticker.add(tickerFnRef.current!);

      gsap.to(activeStrengthRef.current, {
        current: 1,
        duration: hoverDuration,
        ease: 'power2.out',
      });

      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: targetCornerPositionsRef.current![i].x - cursorX,
          y: targetCornerPositionsRef.current![i].y - cursorY,
          duration: 0.2,
          ease: 'power2.out',
        });
      });

      const leaveHandler = () => {
        forceReset();
      };
      currentLeaveHandler = leaveHandler;
      target.addEventListener('mouseleave', leaveHandler);
    };

    window.addEventListener('mouseover', enterHandler as EventListener);

    return () => {
      forceReset();
      stopObserver();
      forceResetRef.current = null;
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseover', enterHandler as EventListener);
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('mousedown', mouseDownHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
      spinTl.current?.kill();
      document.body.style.cursor = originalCursor;
    };
  }, [
    targetSelector,
    spinDuration,
    moveCursor,
    constants,
    hideDefaultCursor,
    isMobile,
    hoverDuration,
    parallaxOn,
  ]);

  useEffect(() => {
    if (isMobile || !cursorRef.current || !spinTl.current) return;
    if (spinTl.current.isActive()) {
      spinTl.current.kill();
      spinTl.current = gsap
        .timeline({ repeat: -1 })
        .to(cursorRef.current, { rotation: '+=360', duration: spinDuration, ease: 'none' });
    }
  }, [spinDuration, isMobile]);

  /**
   * 方案 C — resetKey 变化时立即释放锁定目标
   * NOTE: 用于 tab 切换等场景，旧页面 DOM 被卸载前主动重置光标
   */
  useEffect(() => {
    if (isMobile) return;
    // resetKey 变化说明上下文切换了，立即清理
    forceResetRef.current?.();
  }, [resetKey, isMobile]);

  if (isMobile) {
    return null;
  }

  /**
   * NOTE: 光标颜色使用昆仑主题碧蓝 var(--color-nexus-primary)，与工作台整体配色保持一致
   * 中心点使用主题色，四角 L 型边框使用碧蓝色
   * 使用内联 style 而非 Tailwind class，避免与 Tailwind v4 的兼容性问题
   */
  const primaryColor = 'var(--color-nexus-primary)';

  return (
    <div
      ref={cursorRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        willChange: 'transform',
      }}
    >
      {/* 中心瞄准点 */}
      <div
        ref={dotRef}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 4,
          height: 4,
          backgroundColor: primaryColor,
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          willChange: 'transform',
          boxShadow: `0 0 6px ${primaryColor}99`,
        }}
      />
      {/* 左上角 L 型边框 */}
      <div
        className="target-cursor-corner"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 12,
          height: 12,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: primaryColor,
          borderRight: 'none',
          borderBottom: 'none',
          transform: 'translate(-150%, -150%)',
          willChange: 'transform',
        }}
      />
      {/* 右上角 L 型边框 */}
      <div
        className="target-cursor-corner"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 12,
          height: 12,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: primaryColor,
          borderLeft: 'none',
          borderBottom: 'none',
          transform: 'translate(50%, -150%)',
          willChange: 'transform',
        }}
      />
      {/* 右下角 L 型边框 */}
      <div
        className="target-cursor-corner"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 12,
          height: 12,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: primaryColor,
          borderLeft: 'none',
          borderTop: 'none',
          transform: 'translate(50%, 50%)',
          willChange: 'transform',
        }}
      />
      {/* 左下角 L 型边框 */}
      <div
        className="target-cursor-corner"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 12,
          height: 12,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: primaryColor,
          borderRight: 'none',
          borderTop: 'none',
          transform: 'translate(-150%, 50%)',
          willChange: 'transform',
        }}
      />
    </div>
  );
};

export default TargetCursor;
