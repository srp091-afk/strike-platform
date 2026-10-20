"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { creativeCanvasSize } from "@/lib/creative-format";
import { cn } from "@/lib/utils";
import type { CreativeFormat } from "@/types/creatives";

export const CREATIVE_WIDTH = 1080;
export const CREATIVE_HEIGHT = 1350;

type CreativeWrapperProps = {
  children: ReactNode;
  className?: string;
  /** 4:5 feed (1080×1350 canvas) or 9:16 stories (1080×1920 canvas). */
  format?: CreativeFormat;
};

/**
 * Fixed design canvas that scales to the parent width so Tailwind sizes
 * (text-4xl, p-10, …) match the real banner. Canvas aspect follows
 * `format`: 1080×1350 for 4:5, 1080×1920 for 9:16.
 */
export function CreativeWrapper({ children, className, format = "4:5" }: CreativeWrapperProps) {
  const canvas = creativeCanvasSize(format);
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const width = host.clientWidth;
      if (width <= 0) return;
      setScale(width / canvas.width);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [canvas.width]);

  return (
    <div
      ref={hostRef}
      className={cn("relative w-full overflow-hidden bg-black", className)}
      style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: canvas.width,
          height: canvas.height,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
