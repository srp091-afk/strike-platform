import { Lock } from "lucide-react";
import Link from "next/link";

/** Заглушка закрытого модуля. Цвета явные: внутри портала white/black инвертируются. */
export function LockedModuleOverlay() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-gray-200 bg-[#fff] text-gray-500">
        <Lock className="size-5" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-2xl font-semibold text-[#0b0b0f]">Этот модуль пока недоступен в вашем тарифе</h1>
      <Link
        href="/dashboard/billing"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-strike px-4 text-sm font-semibold text-[#fff]"
      >
        Перейти к тарифам
      </Link>
    </div>
  );
}
