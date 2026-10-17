export const navItems = [
  { href: "/", label: "Дашборд" },
  { href: "/agents", label: "Агенты" },
  { href: "/funnels", label: "Сайты" },
  { href: "/ads/new", label: "AI-Кампании" },
  { href: "/chats", label: "Чаты" },
] as const;

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/ads/new") return pathname.startsWith("/ads");
  return pathname === href || pathname.startsWith(`${href}/`);
}
