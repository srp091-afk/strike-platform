import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** light — белый текст для тёмного фона, dark — чёрный для светлого дашборда. Точка всегда красная. */
  variant?: "light" | "dark";
};

const tones = {
  light: "text-white",
  dark: "text-gray-900",
} as const;

export function Logo({ className, variant = "dark" }: LogoProps) {
  return (
    <span
      className={cn(
        "inline-block font-sans text-lg leading-none font-black tracking-tight uppercase",
        tones[variant],
        className,
      )}
    >
      STRIKE<span className="text-rose-600">.</span>
    </span>
  );
}
