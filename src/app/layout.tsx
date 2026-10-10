import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

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

export const metadata: Metadata = {
  title: {
    default: "STRIKE",
    template: "%s — STRIKE",
  },
  description: "Платформа для создания и управления ИИ-агентами.",
};

export const viewport: Viewport = {
  themeColor: "#F8FAFC",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-[#F8FAFC] font-sans text-[#09090B]">
        <Suspense fallback={<div className="sticky top-0 z-50 h-16 border-b border-zinc-200 bg-white" />}>
          <SiteHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={<div className="mt-auto h-14 border-t border-zinc-200 bg-white" />}>
          <SiteFooter />
        </Suspense>
      </body>
    </html>
  );
}
