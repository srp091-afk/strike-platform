"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { LegalLinks } from "@/components/legal-links";
import { isPortalPath } from "@/lib/navigation";

/**
 * Каркас страницы. Внутренний портал (после входа) — светлая тема `.portal` и левый сайдбар;
 * публичные страницы (лендинг, вход, цены, демо, юридические) остаются тёмными без навигации.
 * `sidebar` и `footer` — серверные слоты: профиль читается на сервере.
 */
export function AppShell({
  sidebar,
  footer,
  children,
}: {
  sidebar: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (!isPortalPath(pathname)) {
    return (
      <>
        <main className="flex-1">{children}</main>
        {footer}
      </>
    );
  }

  return (
    <div className="portal flex min-h-screen flex-1 bg-gray-50 text-gray-600">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col pt-12 lg:pt-0">
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 px-6 py-3">
          <LegalLinks className="justify-center sm:justify-end" />
        </footer>
      </div>
    </div>
  );
}
