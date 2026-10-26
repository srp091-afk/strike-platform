import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

const MIN_TOPUP = 10;
const MAX_TOPUP = 10000;

/**
 * Создаёт чекаут Flex на точную сумму пополнения через API Lemon Squeezy.
 * 501 — API не настроен (нет ключа / варианта): клиент откроет обычную ссылку Flex.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { amount?: unknown } | null;
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return Response.json({ error: `Сумма должна быть от $${MIN_TOPUP} до $${MAX_TOPUP}.` }, { status: 400 });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_FLEX_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) {
    return Response.json({ error: "Checkout API is not configured" }, { status: 501 });
  }

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          custom_price: Math.round(amount * 100),
          checkout_data: {
            email: user.email ?? undefined,
            custom: { user_id: user.id },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  if (!response.ok) {
    console.error("[billing] lemon checkout failed", response.status, await response.text().catch(() => ""));
    return Response.json({ error: "Не удалось создать чекаут." }, { status: 502 });
  }

  const json = (await response.json()) as { data?: { attributes?: { url?: string } } };
  const url = json.data?.attributes?.url;
  if (!url) {
    return Response.json({ error: "Не удалось создать чекаут." }, { status: 502 });
  }
  return Response.json({ url });
}
