import Link from "next/link";

import { cn } from "@/lib/utils";

const LABELS = {
  ru: { privacy: "Политика конфиденциальности", terms: "Пользовательское соглашение", refund: "Политика возврата" },
  en: { privacy: "Privacy Policy", terms: "Terms of Service", refund: "Refund Policy" },
} as const;

/** Ссылки на обязательные юридические страницы (Lemon Squeezy требует Refund Policy). */
export function LegalLinks({ lang = "ru", className }: { lang?: "ru" | "en"; className?: string }) {
  const labels = LABELS[lang];
  const items = [
    { href: "/privacy", label: labels.privacy },
    { href: "/terms", label: labels.terms },
    { href: "/refund", label: labels.refund },
  ];

  return (
    <nav aria-label="Legal" className={cn("flex flex-wrap items-center justify-center gap-x-5 gap-y-2", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-xs text-zinc-500 transition-colors hover:text-strike-soft"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
