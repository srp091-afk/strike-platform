"use client";

import {
  Bot,
  CreditCard,
  Globe,
  LayoutDashboard,
  Megaphone,
  Send,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Share2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { AccountMenu } from "@/components/account-menu";
import { BrandLogo } from "@/components/brand-logo";
import type { AccountProfile } from "@/lib/auth-user";
import { bottomNav, isNavActive, mainNav, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<NavItem["icon"], LucideIcon> = {
  dashboard: LayoutDashboard,
  agents: Bot,
  sites: Globe,
  ads: Megaphone,
  outreach: Send,
  smm: Share2,
  chats: MessagesSquare,
  billing: CreditCard,
  settings: Settings,
};

const COLLAPSE_KEY = "strike.sidebar.collapsed";

function NavLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];
  const active = !item.soon && isNavActive(pathname, item.href);
  const className = cn(
    "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
    collapsed && "justify-center px-0",
    active ? "bg-strike/10 text-strike" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
    item.soon && "cursor-default text-gray-400 hover:bg-transparent hover:text-gray-400",
  );
  const content = (
    <>
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-strike" /> : null}
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
      {item.beta && collapsed ? <span aria-hidden className="absolute right-2 top-2 size-1.5 rounded-full bg-strike" /> : null}
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {item.beta && !collapsed ? (
        <span className="shrink-0 rounded-full bg-strike/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-strike ring-1 ring-inset ring-strike/20">
          Beta
        </span>
      ) : null}
      {item.soon && !collapsed ? (
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Скоро
        </span>
      ) : null}
    </>
  );

  if (item.soon) {
    return (
      <span aria-disabled="true" title={collapsed ? `${item.label} — скоро` : undefined} className={className}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      prefetch
      aria-current={active ? "page" : undefined}
      title={collapsed ? (item.beta ? `${item.label} (Beta)` : item.label) : undefined}
      onClick={onNavigate}
      className={className}
    >
      {content}
    </Link>
  );
}

function SidebarBody({
  account,
  collapsed,
  pathname,
  onToggle,
  onNavigate,
  toggleIcon,
}: {
  account: AccountProfile | null;
  collapsed: boolean;
  pathname: string;
  onToggle?: () => void;
  onNavigate?: () => void;
  toggleIcon?: "collapse" | "close";
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center px-3", collapsed ? "justify-center" : "justify-between")}>
        {collapsed ? null : (
          <Link href="/dashboard" aria-label="STRIKE" onClick={onNavigate} className="flex items-center pl-2">
            <BrandLogo tone="dark" />
          </Link>
        )}
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleIcon === "close" ? "Закрыть меню" : collapsed ? "Развернуть меню" : "Свернуть меню"}
            className="grid size-8 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            {toggleIcon === "close" ? (
              <X className="size-[18px]" strokeWidth={1.75} />
            ) : collapsed ? (
              <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
            )}
          </button>
        ) : null}
      </div>

      <nav aria-label="Основное меню" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-gray-200 px-3 py-3">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {account ? (
          <div className="mt-1 border-t border-gray-100 pt-2">
            <AccountMenu account={account} collapsed={collapsed} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Левая навигация портала. На десктопе сворачивается в узкую панель с иконками (состояние помнится),
 * на мобильных скрыта: сверху фиксированная полоса с бургером, меню выезжает слева.
 */
export function AppSidebar({ account }: { account: AccountProfile | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-gray-200 bg-[#fff] transition-[width] duration-200 lg:block",
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        <SidebarBody account={account} collapsed={collapsed} pathname={pathname} onToggle={toggleCollapsed} />
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-gray-200 bg-[#fff] px-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          aria-expanded={mobileOpen}
          className="grid size-9 place-items-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100"
        >
          <Menu className="size-5" strokeWidth={1.75} />
        </button>
        <Link href="/dashboard" aria-label="STRIKE" className="flex items-center">
          <BrandLogo tone="dark" />
        </Link>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-gray-900/40"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-gray-200 bg-[#fff] shadow-xl">
            <SidebarBody
              account={account}
              collapsed={false}
              pathname={pathname}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              toggleIcon="close"
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}

/** Заглушка на время загрузки профиля: держит место под сайдбар, чтобы контент не прыгал. */
export function AppSidebarSkeleton() {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-gray-200 bg-[#fff] lg:block" />
      <div className="fixed inset-x-0 top-0 z-40 h-12 border-b border-gray-200 bg-[#fff] lg:hidden" />
    </>
  );
}
