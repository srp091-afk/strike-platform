import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function paddleApiBase() {
  return process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

function idOf(value: unknown, prefix: string) {
  const id = typeof value === "string" ? value.trim() : "";
  return id.startsWith(prefix) ? id : "";
}

/** Ссылка на Customer Portal Paddle: обзор, отмена и оплата подписки текущего пользователя. */
export async function POST() {
  await connection();
  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Портал управления не настроен." }, { status: 501 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("paddle_customer_id, paddle_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    const missing = /paddle_customer_id|paddle_subscription_id/.test(error.message);
    return Response.json(
      { error: missing ? "Примените миграцию 20261119_paddle_customer.sql." : error.message },
      { status: missing ? 503 : 500 },
    );
  }

  const customerId = idOf(profile?.paddle_customer_id, "ctm_");
  if (!customerId) {
    return Response.json({ error: "Активной подписки нет." }, { status: 404 });
  }

  const subscriptionId = idOf(profile?.paddle_subscription_id, "sub_");
  const response = await fetch(`${paddleApiBase()}/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("[billing] paddle portal session failed", response.status);
    return Response.json({ error: "Не удалось получить ссылку на портал." }, { status: 502 });
  }

  const json = (await response.json()) as { data?: { urls?: { general?: { overview?: string } } } };
  const url = json.data?.urls?.general?.overview;
  if (!url) {
    return Response.json({ error: "Не удалось получить ссылку на портал." }, { status: 502 });
  }
  return Response.json({ url });
}
