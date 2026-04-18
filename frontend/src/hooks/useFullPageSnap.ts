import { useEffect, useRef, useCallback } from 'react';

/**
 * 极简全屏吸附滚动 Hook — PPT 翻页
 *
 * NOTE: 原理非常简单：
 *   1. 禁止浏览器默认滚动（overflow: hidden on body）
 *   2. 监听 wheel 事件，累积 deltaY
 *   3. 累积量超过阈值 → 切换到上/下一个 section
 *   4. 使用 scrollTo smooth 或 requestAnimationFrame 平滑过渡
 */

/** 滚轮累积阈值 — 超过此值才翻页，防止触控板过于灵敏 */
const DELTA_THRESHOLD = 80;

/** 翻页动画时长（毫秒） */
const ANIMATION_DURATION = 700;

/** 翻页完成后的冷却时间（毫秒） */
const COOLDOWN = 800;

export function useFullPageSnap() {
  const currentIndexRef = useRef(0);
  const isLockedRef = useRef(false);
  const accumulatedRef = useRef(0);
  const lastWheelTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  /** 获取 main 下所有 section（不含 footer） */
  const getSections = useCallback((): HTMLElement[] => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return [];
    return Array.from(mainEl.querySelectorAll(':scope > section'));
  }, []);

  /** 平滑滚动到目标 section */
  const scrollToSection = useCallback((index: number) => {
    const sections = getSections();
    if (index < 0 || index >= sections.length) return;

    isLockedRef.current = true;
    currentIndexRef.current = index;

    const targetY = sections[index].offsetTop;
    const startY = window.scrollY;
    const distance = targetY - startY;
    const startTime = performance.now();

    if (Math.abs(distance) < 1) {
      isLockedRef.current = false;
      return;
    }

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
      // ease-out cubic — 快起慢停，丝滑自然
      const eased = 1 - Math.pow(1 - progress, 3);

      window.scrollTo(0, startY + distance * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // 翻页完成 → 冷却后解锁
        setTimeout(() => {
          isLockedRef.current = false;
          accumulatedRef.current = 0;
        }, COOLDOWN);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
  }, [getSections]);

  /** 向外暴露的翻页方法 */
  const goTo = useCallback((index: number) => {
    if (isLockedRef.current) return;
    scrollToSection(index);
  }, [scrollToSection]);

  const goNext = useCallback(() => {
    const sections = getSections();
    const next = Math.min(currentIndexRef.current + 1, sections.length - 1);
    if (next !== currentIndexRef.current) goTo(next);
  }, [getSections, goTo]);

  const goPrev = useCallback(() => {
    const prev = Math.max(currentIndexRef.current - 1, 0);
    if (prev !== currentIndexRef.current) goTo(prev);
  }, [goTo]);

  const goFirst = useCallback(() => goTo(0), [goTo]);

  const goLast = useCallback(() => {
    const sections = getSections();
    if (sections.length > 0) goTo(sections.length - 1);
  }, [getSections, goTo]);

  useEffect(() => {
    // 初始化：禁止 body 滚动，由 Hook 接管
    document.body.style.overflow = 'hidden';

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isLockedRef.current) return;

      const now = performance.now();
      // 滚轮间隔太长 → 重置累积
      if (now - lastWheelTimeRef.current > 200) {
        accumulatedRef.current = 0;
      }
      lastWheelTimeRef.current = now;

      accumulatedRef.current += e.deltaY;

      if (accumulatedRef.current > DELTA_THRESHOLD) {
        accumulatedRef.current = 0;
        goNext();
      } else if (accumulatedRef.current < -DELTA_THRESHOLD) {
        accumulatedRef.current = 0;
        goPrev();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('wheel', handleWheel);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [goNext, goPrev]);

  /** 键盘快捷键 */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isLockedRef.current) return;
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goPrev();
          break;
        case 'Home':
          e.preventDefault();
          goFirst();
          break;
        case 'End':
          e.preventDefault();
          goLast();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, goFirst, goLast]);

  return { goNext, goPrev, goFirst, goLast, goTo, currentIndex: currentIndexRef };
}

export default useFullPageSnap;
