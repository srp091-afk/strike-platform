import { Bot, Funnel, LayoutDashboard, MessagesSquare, Play } from "lucide-react";

export const navItems = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/agents", label: "Агенты", icon: Bot },
  { href: "/funnels", label: "Воронки", icon: Funnel },
  { href: "/playground", label: "Симулятор", icon: Play },
  { href: "/chats", label: "Чаты", icon: MessagesSquare },
] as const;

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
