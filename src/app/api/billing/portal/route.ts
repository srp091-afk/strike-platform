import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/** Ссылка на Customer Portal Lemon Squeezy (карта, счета, отмена) для подписки текущего пользователя. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Портал управления не настроен." }, { status: 501 });
  }

  // ID подписки берём только из своего профиля, а не из запроса.
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("lemon_subscription_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const subscriptionId = typeof profile?.lemon_subscription_id === "string" ? profile.lemon_subscription_id : "";
  if (!subscriptionId) {
    return Response.json({ error: "Активной подписки нет." }, { status: 404 });
  }

  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("[billing] lemon subscription lookup failed", response.status);
    return Response.json({ error: "Не удалось получить ссылку на портал." }, { status: 502 });
  }

  const json = (await response.json()) as { data?: { attributes?: { urls?: { customer_portal?: string } } } };
  const url = json.data?.attributes?.urls?.customer_portal;
  if (!url) {
    return Response.json({ error: "Не удалось получить ссылку на портал." }, { status: 502 });
  }
  return Response.json({ url });
}
