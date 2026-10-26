export const navItems = [
  { href: "/dashboard", label: "Дашборд" },
  { href: "/agents", label: "Агенты" },
  { href: "/funnels", label: "Сайты" },
  { href: "/ads", label: "AI-Кампании" },
  { href: "/chats", label: "Чаты" },
  { href: "/dashboard/billing", label: "Биллинг" },
] as const;

export function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/ads") return pathname === "/ads" || pathname.startsWith("/ads/");
  return pathname === href || pathname.startsWith(`${href}/`);
}
