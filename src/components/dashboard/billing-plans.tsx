"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ModularPlans, type CurrentPlans } from "@/components/billing/modular-plans";
import { toast } from "@/components/ui/toaster";
import { openCustomerPortal, openPlanCheckout } from "@/lib/lemon-client";

/** Светлая витрина модульных тарифов: те же данные и табы, что на /pricing. */
export function BillingPlans({ current, subscriptionActive }: { current: CurrentPlans; subscriptionActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function choose(key: string) {
    if (pending) return;
    setPending(key);
    try {
      if (subscriptionActive) {
        // Смена плана у активной подписки — через портал, чтобы не создать вторую подписку.
        await openCustomerPortal();
      } else {
        const result = await openPlanCheckout(key);
        if (result === "login") router.push("/login");
        else if (result === "missing") toast.error("Чекаут этого тарифа пока не настроен.");
      }
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
            ? "Смена тарифа происходит в портале управления подпиской."
            : "Подключайте только нужные модули или выберите выгодный бандл STRIKE Business."}
        </p>
      </div>
      <ModularPlans theme="light" current={current} onSelect={(key) => void choose(key)} pendingKey={pending} />
    </section>
  );
}