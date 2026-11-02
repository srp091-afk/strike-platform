"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Плавное появление блока при попадании во вьюпорт. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Подсветка границы и фона следом за курсором. */
export function trackPointer(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
}

/** Карточка с градиентной рамкой и свечением под курсором. */
export function GlowCard({
  icon,
  title,
  desc,
  accent = "indigo",
  className,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  desc?: string;
  accent?: "indigo" | "strike";
  className?: string;
  children?: ReactNode;
}) {
  const border = accent === "strike" ? "rgba(255,92,128,0.75)" : "rgba(165,180,252,0.7)";
  const fill = accent === "strike" ? "rgba(207,2,52,0.14)" : "rgba(129,140,248,0.12)";
  return (
    <div
      onMouseMove={trackPointer}
      style={{ "--mx": "50%", "--my": "0%" } as CSSProperties}
      className={cn(
        "group relative h-full rounded-2xl bg-white/10 p-px transition-transform duration-300 ease-out hover:-translate-y-1",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(320px circle at var(--mx) var(--my), ${border}, transparent 70%)` }}
      />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[15px] bg-[#0a0a0a]/90 p-6 backdrop-blur-xl sm:p-7">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: `radial-gradient(420px circle at var(--mx) var(--my), ${fill}, transparent 65%)` }}
        />
        {icon ? (
          <span className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-200">
            {icon}
          </span>
        ) : null}
        {title ? <h3 className="relative mt-6 text-lg font-semibold text-white">{title}</h3> : null}
        {desc ? <p className="relative mt-2 text-sm leading-6 text-zinc-400">{desc}</p> : null}
        {children}
      </div>
    </div>
  );
}
