"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Monitor, Server } from "lucide-react";
import { useT } from "@/lib/i18n/useT";
import type { ConnectionSession } from "@/lib/stores/connectionsStore";

export function ConnectingScreen({ session }: { session: ConnectionSession }) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const ferryRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const wakeRef = useRef<HTMLDivElement>(null);
  const localRingRef = useRef<HTMLSpanElement>(null);
  const remoteRingRef = useRef<HTMLSpanElement>(null);
  const dotsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(rootRef.current, { opacity: 0, y: 12, duration: 0.4, ease: "power2.out" });

      gsap.set(ferryRef.current, { xPercent: -50, yPercent: -50 });

      gsap.to(lineRef.current, {
        backgroundPositionX: "-24px",
        duration: 0.7,
        ease: "none",
        repeat: -1,
      });

      gsap.to(ferryRef.current, {
        left: "100%",
        duration: 2.2,
        ease: "power1.inOut",
        repeat: -1,
        yoyo: true,
      });
      gsap.to(ferryRef.current, { y: -7, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(ferryRef.current, { rotation: 5, duration: 1.1, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(wakeRef.current, { opacity: 0.5, scale: 1.3, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: -1 });

      gsap.to([localRingRef.current, remoteRingRef.current], {
        scale: 1.7,
        opacity: 0,
        duration: 1.6,
        ease: "power1.out",
        repeat: -1,
        stagger: { each: 0.8 },
      });

      if (dotsRef.current) {
        gsap.to(dotsRef.current.children, {
          opacity: 1,
          duration: 0.4,
          ease: "power1.inOut",
          stagger: { each: 0.18, yoyo: true, repeat: -1 },
        });
      }
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div ref={rootRef} className="flex w-full max-w-md flex-col items-center">
        <div className="flex w-full items-center justify-between">
          <Endpoint icon={<Monitor className="size-5" />} label={t("filePane.thisComputer")} ringRef={localRingRef} />

          <div className="relative mx-3 h-12 flex-1">
            <div
              ref={lineRef}
              className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, var(--color-accent) 0 6px, transparent 6px 12px)",
                backgroundSize: "12px 100%",
                opacity: 0.5,
              }}
            />
            <div ref={ferryRef} className="absolute" style={{ left: 0, top: "50%" }}>
              <div ref={wakeRef} className="absolute -inset-1.5 rounded-full bg-accent/30 opacity-0 blur-md" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.png" alt="" className="relative size-8 rounded-[22%] shadow-md" />
            </div>
          </div>

          <Endpoint icon={<Server className="size-5" />} label={session.label} ringRef={remoteRingRef} />
        </div>

        <p className="mt-8 flex items-center gap-1 text-sm font-medium text-foreground">
          {t("statusBar.connecting")}
          <span ref={dotsRef} className="inline-flex">
            <span className="opacity-20">.</span>
            <span className="opacity-20">.</span>
            <span className="opacity-20">.</span>
          </span>
        </p>
        <p className="mt-1 text-xs text-foreground-muted">
          {session.username}@{session.host}:{session.port}
        </p>
      </div>
    </div>
  );
}

function Endpoint({
  icon,
  label,
  ringRef,
}: {
  icon: React.ReactNode;
  label: string;
  ringRef: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-2">
      <span className="relative flex size-12 items-center justify-center rounded-2xl border border-border bg-surface-1 text-foreground">
        <span ref={ringRef} className="absolute inset-0 rounded-2xl ring-2 ring-accent/40" />
        {icon}
      </span>
      <span className="max-w-full truncate text-xs text-foreground-muted">{label}</span>
    </div>
  );
}
