"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const tl = gsap.timeline({ onComplete: onDone });
    tl.fromTo(
      logoRef.current,
      { scale: 0.6, opacity: 0, y: 8 },
      { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.7)" },
    )
      .fromTo(
        textRef.current,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" },
        "-=0.15",
      )
      .to({}, { duration: 0.45 })
      .to(overlayRef.current, { opacity: 0, duration: 0.35, ease: "power2.in" });
    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={logoRef} src="/icon.png" alt="Ferry" className="size-20 rounded-[22%]" />
      <span ref={textRef} className="text-lg font-semibold tracking-wide text-foreground">
        Ferry
      </span>
    </div>,
    document.body,
  );
}
