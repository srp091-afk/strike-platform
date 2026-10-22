import type { Metadata } from "next";
import { Suspense } from "react";

import { WidgetChat } from "@/components/widget-chat";
import { getWidgetConfig } from "@/lib/widget";

export const metadata: Metadata = {
  title: "Чат",
  robots: { index: false, follow: false },
};

/**
 * Публичная страница веб-виджета: только плавающий чат без навигации
 * платформы (шапка/подвал скрыты для /widget/*). Грузится в iframe из
 * /widget/embed.js, поэтому фон страницы прозрачный — иначе свёрнутый
 * лаунчер закрывал бы сайт клиента непрозрачным квадратом.
 * Данные агента — runtime-доступ, поэтому чтение вынесено под <Suspense>
 * (Cache Components: иначе prerender страницы падает на сборке).
 */
export default function WidgetChatPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="h-dvh w-full overflow-hidden">
      <style>{"html,body{background:transparent!important}"}</style>
      <Suspense fallback={null}>
        <WidgetChatContent params={params} />
      </Suspense>
    </div>
  );
}

async function WidgetChatContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await getWidgetConfig(id);

  if (!config) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-zinc-300">Виджет не найден</p>
          <p className="mt-1 text-xs text-zinc-500">Проверьте ссылку или настройки агента.</p>
          <p className="mt-6 text-[10px] text-neutral-500">
            Разработано на платформе{" "}
            <a href="/" target="_blank" rel="noreferrer" className="font-semibold text-neutral-400 transition-colors hover:text-[#dd0005]">
              STRIKE
            </a>
          </p>
        </div>
      </div>
    );
  }

  return <WidgetChat config={config} />;
}
