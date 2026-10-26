"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Url: { Open: (url: string) => void };
      Setup?: (options: { eventHandler: (event: { event: string }) => void }) => void;
    };
  }
}

export type CheckoutTarget = "starter" | "pro" | "agency" | "flex";

// NEXT_PUBLIC_* подставляются при сборке только при прямом обращении к process.env.X.
export const CHECKOUT_URLS: Record<CheckoutTarget, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_LEMON_STARTER_URL,
  pro: process.env.NEXT_PUBLIC_LEMON_PRO_URL,
  agency: process.env.NEXT_PUBLIC_LEMON_AGENCY_URL,
  flex: process.env.NEXT_PUBLIC_LEMON_FLEX_URL,
};

export type CheckoutResult = "opened" | "login" | "missing";

/** Открывает оверлей Lemon Squeezy; user_id попадает в meta.custom_data вебхука. */
export function openLemonOverlay(url: string): void {
  window.createLemonSqueezy?.();
  if (window.LemonSqueezy) {
    window.LemonSqueezy.Url.Open(url);
    return;
  }
  // Lemon.js ещё не загрузился: открываем чекаут обычной страницей.
  const plain = new URL(url);
  plain.searchParams.delete("embed");
  window.location.assign(plain.toString());
}

/** Вызывает callback после успешной оплаты в оверлее (событие Checkout.Success). */
export function watchCheckoutSuccess(onSuccess: () => void): void {
  window.createLemonSqueezy?.();
  window.LemonSqueezy?.Setup?.({
    eventHandler: (event) => {
      if (event.event === "Checkout.Success") onSuccess();
    },
  });
}

export async function currentUser() {
  try {
    const { data } = await createSupabaseBrowserClient().auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

/** Чекаут по готовой ссылке из env (тарифы и Flex). */
export async function openCheckout(target: CheckoutTarget): Promise<CheckoutResult> {
  const base = CHECKOUT_URLS[target];
  if (!base) return "missing";
  const user = await currentUser();
  if (!user) return "login";

  const url = new URL(base);
  url.searchParams.set("embed", "1");
  url.searchParams.set("checkout[custom][user_id]", user.id);
  if (user.email) url.searchParams.set("checkout[email]", user.email);
  openLemonOverlay(url.toString());
  return "opened";
}

/** Пополнение Flex на точную сумму: чекаут создаётся на сервере; без API — обычная ссылка Flex. */
export async function openTopUpCheckout(amount: number): Promise<CheckoutResult> {
  const user = await currentUser();
  if (!user) return "login";

  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (response.status === 501) return openCheckout("flex");
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Не удалось создать чекаут.");
  }
  const { url } = (await response.json()) as { url: string };
  const overlay = new URL(url);
  overlay.searchParams.set("embed", "1");
  openLemonOverlay(overlay.toString());
  return "opened";
}
