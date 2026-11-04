export type NavItem = {
  href: string;
  label: string;
  /** Ключ иконки: сопоставляется с lucide-иконкой в сайдбаре. */
  icon: "dashboard" | "agents" | "sites" | "ads" | "outreach" | "smm" | "chats" | "billing" | "settings";
  /** Визуальная заглушка будущего раздела: пункт показывается, но никуда не ведёт. */
  soon?: boolean;
};

/** Верхний блок сайдбара. */
export const mainNav: readonly NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: "dashboard" },
  { href: "/agents", label: "Агенты", icon: "agents" },
  { href: "/funnels", label: "Сайты", icon: "sites" },
  { href: "/ads", label: "Ads & Креативы", icon: "ads" },
  { href: "/outreach", label: "Рассылки", icon: "outreach" },
  { href: "/smm", label: "SMM", icon: "smm" },
  { href: "/chats", label: "Чаты", icon: "chats" },
];

/** Нижний блок сайдбара (над профилем). */
export const bottomNav: readonly NavItem[] = [
  { href: "/dashboard/billing", label: "Биллинг", icon: "billing" },
  { href: "/settings", label: "Настройки", icon: "settings" },
];

/** Разделы внутреннего портала (светлая тема, сайдбар). Всё остальное — публичные страницы. */
const PORTAL_PREFIXES = [
  "/dashboard",
  "/agents",
  "/funnels",
  "/sites",
  "/ads",
  "/outreach",
  "/chats",
  "/settings",
  "/playground",
  "/test-creatives",
  "/smm",
] as const;

export function isPortalPath(pathname: string) {
  return PORTAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
