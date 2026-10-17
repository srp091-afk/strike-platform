import { Bot, Funnel, LayoutDashboard, Megaphone, MessagesSquare, Play } from "lucide-react";

export const navItems = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/agents", label: "Агенты", icon: Bot },
  { href: "/funnels", label: "Воронки", icon: Funnel },
  { href: "/ads/new", label: "AI-Кампании", icon: Megaphone },
  { href: "/playground", label: "Симулятор", icon: Play },
  { href: "/chats", label: "Чаты", icon: MessagesSquare },
] as const;

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/ads/new") return pathname.startsWith("/ads");
  return pathname === href || pathname.startsWith(`${href}/`);
}
