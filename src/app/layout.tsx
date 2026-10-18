import type { Metadata, Viewport } from "next";
import { Anton, Inter, Montserrat, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeaderData } from "@/components/site-header-data";
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
  subsets: ["latin", "cyrillic"],
  variable: "--font-anton-face",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  variable: "--font-montserrat-face",
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
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${jakarta.variable} ${anton.variable} ${montserrat.variable} h-full bg-black`}
    >
      <body className="flex min-h-full flex-col bg-black font-sans text-zinc-400">
        <Suspense fallback={<div className="sticky top-0 z-50 h-16 border-b border-zinc-800 bg-black" />}>
          <SiteHeaderData />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={<div className="mt-auto h-14 border-t border-zinc-800 bg-black" />}>
          <SiteFooter />
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
