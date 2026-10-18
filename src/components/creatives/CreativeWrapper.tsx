"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export const CREATIVE_WIDTH = 1080;
export const CREATIVE_HEIGHT = 1350;

type CreativeWrapperProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Fixed 1080×1350 (4:5) design canvas that scales to the parent width
 * so Tailwind sizes (text-4xl, p-10, …) match the real banner.
 */
export function CreativeWrapper({ children, className }: CreativeWrapperProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const width = host.clientWidth;
      if (width <= 0) return;
      setScale(width / CREATIVE_WIDTH);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={cn("relative w-full overflow-hidden bg-black", className)}
      style={{ aspectRatio: `${CREATIVE_WIDTH} / ${CREATIVE_HEIGHT}` }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: CREATIVE_WIDTH,
          height: CREATIVE_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
