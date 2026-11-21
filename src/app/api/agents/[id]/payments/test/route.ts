import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { testPaymentProvider, type PaymentProvider } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const provider = text(body?.provider);
    if (provider !== "stripe" && provider !== "yookassa" && provider !== "prodamus") {
      return Response.json({ ok: false, error: "Неизвестный платёжный шлюз." }, { status: 400 });
    }

    const saved = await savedCreds(id);
    const result = await testPaymentProvider(provider, {
      stripeSecret: text(body?.stripeSecretKey) || saved.stripeSecret,
      yookassaShopId: text(body?.yookassaShopId) || saved.yookassaShopId,
      yookassaSecret: text(body?.yookassaSecretKey) || saved.yookassaSecret,
      prodamusShopUrl: text(body?.prodamusShopUrl) || saved.prodamusShopUrl,
      prodamusSecret: text(body?.prodamusSecretKey) || saved.prodamusSecret,
    });
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить платёжный шлюз.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /stripe_|yookassa_|prodamus_|payment_|schema cache/i.test(message)
      ? "Примените миграцию 20261121_agent_payments.sql."
      : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}

async function savedCreds(agentId: string) {
  const empty = { stripeSecret: "", yookassaShopId: "", yookassaSecret: "", prodamusShopUrl: "", prodamusSecret: "" };
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("stripe_secret_key, yookassa_shop_id, yookassa_secret_key, prodamus_shop_url, prodamus_secret_key")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return empty;
  return {
    stripeSecret: text(data.stripe_secret_key),
    yookassaShopId: text(data.yookassa_shop_id),
    yookassaSecret: text(data.yookassa_secret_key),
    prodamusShopUrl: text(data.prodamus_shop_url),
    prodamusSecret: text(data.prodamus_secret_key),
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export type { PaymentProvider };
