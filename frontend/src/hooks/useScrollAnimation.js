import { useEffect, useRef, useState } from 'react';

/**
 * useScrollAnimation – returns a ref and a boolean `isVisible`.
 * Attach the ref to any element and it will animate in when it
 * enters the viewport using IntersectionObserver.
 *
 * @param {number} threshold  – 0-1, how much of the element must be visible (default 0.12)
 * @param {string} rootMargin – CSS margin to expand/shrink trigger zone (default '0px 0px -40px 0px')
 */
export function useScrollAnimation(threshold = 0.12, rootMargin = '0px 0px -40px 0px') {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el); // fire once
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, isVisible];
}

/**
 * useCountUp – animates a number from 0 to `target` over `duration` ms.
 * Triggers only when `shouldStart` is true.
 */
export function useCountUp(target, duration = 1200, shouldStart = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!shouldStart) return;
    // If target is not a pure number (e.g. "98.2%"), just return it
    const numericTarget = parseFloat(target);
    if (isNaN(numericTarget)) {
      setCount(target);
      return;
    }

    let startTime = null;
    const startValue = 0;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(startValue + (numericTarget - startValue) * eased);

      // Preserve suffix like % or decimals
      const suffix = String(target).replace(/[\d.]/g, '');
      setCount(current + suffix);

      if (progress < 1) requestAnimationFrame(step);
    };

    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, shouldStart]);

  return count;
}
