import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** light — белый текст для тёмного фона, dark — чёрный для светлого дашборда. */
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
        "inline-block font-sans text-sm leading-none font-extrabold tracking-[0.2em] uppercase",
        tones[variant],
        className,
      )}
    >
      <span className="text-strike">S</span>TRIKE
    </span>
  );
}
