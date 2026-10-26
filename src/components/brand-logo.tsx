import Image from "next/image";

import { cn } from "@/lib/utils";

/** Логотип STRIKE (белый знак на прозрачном фоне) — заменяет текстовое название в шапках. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="STRIKE"
      width={887}
      height={134}
      priority
      // Размер задаём стилями, исходный файл не меняем. Высота зафиксирована жёстко, ширина по пропорциям.
      style={{ height: "20px", width: "auto" }}
      className={cn("h-5 w-auto object-contain", className)}
    />
  );
}
