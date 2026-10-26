import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Политика возврата",
  description: "Условия возврата платежей за подписки и пополнение баланса STRIKE.",
};

export default function RefundPage() {
  return (
    <LegalPage title="Политика возврата" updated="—">
      <p>Текст политики возврата будет опубликован здесь.</p>
    </LegalPage>
  );
}
