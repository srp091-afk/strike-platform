import type { Metadata, Viewport } from "next";
import { Anton, Bebas_Neue, Inter, Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { AppSidebarSkeleton } from "@/components/app-sidebar";
import { CookieConsent } from "@/components/CookieConsent";
import { SiteFooter } from "@/components/site-footer";
import { SidebarData } from "@/components/sidebar-data";
import { Toaster } from "@/components/ui/toaster";

import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jakarta",
  display: "swap",
});

const anton = Anton({
  weight: "400",
  // @ts-expect-error Anton includes Cyrillic; next/font subset typings lag Google Fonts
  subsets: ["latin", "cyrillic"],
  variable: "--font-anton-face",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  variable: "--font-montserrat-face",
  display: "swap",
});

const bebas = Bebas_Neue({
  weight: "400",
  // @ts-expect-error Bebas Neue includes Cyrillic; next/font subset typings lag Google Fonts
  subsets: ["latin", "cyrillic"],
  variable: "--font-bebas-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "STRIKE",
    template: "%s — STRIKE",
  },
  description: "Платформа для создания и управления ИИ-агентами.",
  // Логотип лежит в public/icons: чтобы заменить, подмените файлы с теми же именами.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${jakarta.variable} ${anton.variable} ${montserrat.variable} ${bebas.variable} h-full bg-black`}
    >
      <body className="flex min-h-full flex-col bg-black font-sans text-zinc-400">
        {/* AppShell читает usePathname (светлый портал vs тёмные публичные страницы): без Suspense пререндер роутов падает. */}
        <Suspense fallback={null}>
          <AppShell
            sidebar={
              <Suspense fallback={<AppSidebarSkeleton />}>
                <SidebarData />
              </Suspense>
            }
            footer={
              <Suspense fallback={<div className="mt-auto h-14 border-t border-zinc-800 bg-black" />}>
                <SiteFooter />
              </Suspense>
            }
          >
            {children}
          </AppShell>
        </Suspense>
        <Toaster />
        <Suspense fallback={null}>
          <CookieConsent />
        </Suspense>
        <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
