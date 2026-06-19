import { gsap } from "gsap";
import { useEffect, type RefObject } from "react";

export function fadeInUp(target: gsap.TweenTarget, delay = 0) {
  return gsap.fromTo(
    target,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.35, delay, ease: "power3.out" },
  );
}

export function staggerRows(target: gsap.TweenTarget) {
  return gsap.fromTo(
    target,
    { opacity: 0, y: 6 },
    {
      opacity: 1,
      y: 0,
      duration: 0.25,
      ease: "power2.out",
      stagger: 0.015,
    },
  );
}

export function scaleIn(target: gsap.TweenTarget) {
  return gsap.fromTo(
    target,
    { opacity: 0, scale: 0.96 },
    { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" },
  );
}

export function slideInFromLeft(target: gsap.TweenTarget) {
  return gsap.fromTo(
    target,
    { x: -16, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.3, ease: "power3.out" },
  );
}

export function slideUpFromBottom(target: gsap.TweenTarget) {
  return gsap.fromTo(
    target,
    { y: 24, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" },
  );
}

/** Fades+lifts the element on mount and whenever `deps` change (e.g. a new directory listing). */
export function useFadeInOnChange(ref: RefObject<Element | null>, deps: unknown[]) {
  useEffect(() => {
    if (ref.current) fadeInUp(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Staggers the direct children of `ref` in whenever `deps` change. */
export function useStaggerOnChange(ref: RefObject<Element | null>, deps: unknown[]) {
  useEffect(() => {
    if (ref.current) staggerRows(ref.current.children);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
