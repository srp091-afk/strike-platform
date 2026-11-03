import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Логотип STRIKE. `tone="light"` — белый знак для тёмных страниц (лендинг, вход), `tone="dark"` — чёрный знак
 * для светлого портала. Высота намеренно маленькая (20px, как у минималистичных платформ), ширина по пропорциям.
 */
export function BrandLogo({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <Image
      src={tone === "dark" ? "/logo_black.png" : "/logo.png"}
      alt="STRIKE"
      width={887}
      height={134}
      priority
      style={{ height: "20px", width: "auto" }}
      className={cn("h-5 w-auto object-contain", className)}
    />
  );
}
