import type { Metadata } from "next";

import { WidgetChat } from "@/components/widget-chat";
import { getWidgetConfig } from "@/lib/widget";

export const metadata: Metadata = {
  title: "Чат",
  robots: { index: false, follow: false },
};

/**
 * Публичная страница веб-виджета: только интерфейс чата без навигации
 * платформы (шапка/подвал скрыты для /widget/*). Грузится в iframe, поэтому
 * занимает весь вьюпорт и скруглена по краям.
 */
export default async function WidgetChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await getWidgetConfig(id);

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#0a0a0a] sm:rounded-2xl">
      {config ? (
        <WidgetChat config={config} />
      ) : (
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
      )}
    </div>
  );
}
