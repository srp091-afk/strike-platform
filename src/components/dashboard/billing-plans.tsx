"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ModularPlans, type CurrentPlans } from "@/components/billing/modular-plans";
import { toast } from "@/components/ui/toaster";
import { PADDLE_PLANS } from "@/lib/paddle-catalog";
import { loadPaddle, openPaddleCheckout } from "@/lib/paddle-client";

/** Светлая витрина модульных тарифов: те же данные и табы, что на /pricing. */
export function BillingPlans({ current, subscriptionActive }: { current: CurrentPlans; subscriptionActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void loadPaddle();
  }, []);

  async function choose(key: string) {
    if (pending) return;
    const priceId = PADDLE_PLANS[key]?.priceId;
    if (!priceId) {
      toast.error("Для этого тарифа не задан Price ID Paddle.");
      return;
    }
    setPending(key);
    try {
      const result = await openPaddleCheckout(priceId);
      if (result === "login") router.push("/login");
      else if (result === "missing") toast.error("Чекаут Paddle пока не настроен. Добавьте NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть чекаут.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="plans" className="mt-5 scroll-mt-24">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#0b0b0f]">Тарифы</h2>
        <p className="mt-1 text-sm text-gray-500">
          {subscriptionActive
            ? "Новый тариф открывается в чекауте Paddle. Текущую подписку Lemon Squeezy можно закрыть в портале управления."
            : "Подключайте только нужные модули или выберите выгодный бандл STRIKE Business."}
        </p>
      </div>
      <ModularPlans theme="light" current={current} onSelect={(key) => void choose(key)} pendingKey={pending} />
    </section>
  );
}