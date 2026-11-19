"use client";

import { initializePaddle, type CheckoutSettings, type Paddle } from "@paddle/paddle-js";

import { currentUser } from "@/lib/lemon-client";

export type PaddleCheckoutResult = "opened" | "login" | "missing";

/** Светлый одностраничный оверлей. Цвет кнопок Paddle.js не принимает: его задаёт primary_checkout_color в аккаунте. */
const CHECKOUT_SETTINGS = {
  displayMode: "overlay",
  theme: "light",
  variant: "one-page",
  locale: "ru",
} as const satisfies CheckoutSettings;

const completedListeners = new Set<() => void>();
let paddlePromise: Promise<Paddle | undefined> | null = null;

/** Повторно использует один экземпляр Paddle.js. Без client token чекаут не открывается. */
export function loadPaddle(): Promise<Paddle | undefined> {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) return Promise.resolve(undefined);
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      token,
      environment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox",
      checkout: { settings: CHECKOUT_SETTINGS },
      eventCallback(event) {
        if (event.name === "checkout.completed") {
          completedListeners.forEach((listener) => listener());
        }
      },
    }).catch((error: unknown) => {
      paddlePromise = null;
      throw error;
    });
  }
  return paddlePromise;
}

export function onPaddleCheckoutCompleted(listener: () => void) {
  completedListeners.add(listener);
  return () => {
    completedListeners.delete(listener);
  };
}

/** Оверлей Paddle. userId уходит в customData и возвращается в вебхуке как custom_data.userId. */
export async function openPaddleCheckout(priceId: string): Promise<PaddleCheckoutResult> {
  if (!priceId) return "missing";
  const user = await currentUser();
  if (!user) return "login";
  const paddle = await loadPaddle();
  if (!paddle) return "missing";
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { userId: user.id },
    settings: CHECKOUT_SETTINGS,
  });
  return "opened";
}
