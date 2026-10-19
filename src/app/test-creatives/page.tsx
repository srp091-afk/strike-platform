import type { Metadata } from "next";

import { Style1_VS } from "@/components/creatives/templates/Style1_VS";
import { Style2_SplitAction } from "@/components/creatives/templates/Style2_SplitAction";
import { Style6_Glass } from "@/components/creatives/templates/Style6_Glass";
import type { CreativeTemplateProps } from "@/types/creatives";

export const metadata: Metadata = {
  title: "Test creatives",
};

const mockSplit: CreativeTemplateProps = {
  headline: "До / После",
  subheadline: "Одна ниша — разный результат",
  bullets: ["Системные креативы", "Стабильный CPL", "Масштаб без хаоса"],
  buttonText: "Получить стратегию",
  images: [
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1080&h=1350&q=80",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1080&h=1350&q=80",
  ],
  accentColor: "#E11D48",
};

const mockSplitAction: CreativeTemplateProps = {
  headline: "Заявки без слива",
  subheadline: "Система под ключ",
  badge: "Старт за 7 дней",
  bullets: ["Чёткий оффер", "Контроль CPL", "Масштаб без хаоса", "Прозрачная аналитика"],
  buttonText: "Получить план",
  images: [
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=1080&h=1350&q=80",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1080&h=1350&q=80",
  ],
  accentColor: "#FFE600",
};

const mockGlass: CreativeTemplateProps = {
  headline: "Премиум-запуск за 7 дней",
  subheadline: "AI-креативы, которые выглядят как студийная съёмка",
  badge: "Limited offer",
  bullets: [
    "Стеклянные офферы на тёмном фоне",
    "Акцент на оффере и CTA",
    "Готовый формат 4:5 для Meta",
  ],
  buttonText: "Запустить кампанию",
  images: [
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1080&h=1350&q=80",
  ],
  accentColor: "#F97316",
};

export default function TestCreativesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Dev</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Creative templates</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Превью холста 1080×1350 (4:5). Tailwind-размеры внутри шаблонов соответствуют реальному баннеру.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-2 xl:grid-cols-3">
        <section className="grid gap-4">
          <h2 className="font-montserrat text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            Style 1 — VS Split
          </h2>
          <Style1_VS {...mockSplit} />
        </section>
        <section className="grid gap-4">
          <h2 className="font-montserrat text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            Style 2 — Split Action
          </h2>
          <Style2_SplitAction {...mockSplitAction} />
        </section>
        <section className="grid gap-4">
          <h2 className="font-montserrat text-sm font-semibold tracking-wide text-zinc-300 uppercase">
            Style 6 — Dark Glass
          </h2>
          <Style6_Glass {...mockGlass} />
        </section>
      </div>
    </div>
  );
}
