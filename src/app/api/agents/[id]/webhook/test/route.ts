import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { isHttpUrl, postAgentWebhook } from "@/lib/webhooks";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, status: 0, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { webhook_url?: unknown; webhook_secret?: unknown } | null;
    const requestedUrl = typeof body?.webhook_url === "string" ? body.webhook_url.trim() : "";
    const requestedSecret = typeof body?.webhook_secret === "string" ? body.webhook_secret.trim() : "";

    const saved = await readSavedWebhook(id, owned.userId);
    const url = requestedUrl || saved.url;
    const secret = body && "webhook_secret" in body ? requestedSecret : saved.secret;
    if (!isHttpUrl(url)) {
      return Response.json(
        { ok: false, status: 0, error: "Укажите Webhook URL, начинающийся с http:// или https://." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await postAgentWebhook(
      { id, name: saved.name, webhook_url: url, webhook_secret: secret || null },
      {
        event: "webhook.test",
        channel: "sandbox",
        chat_id: "test",
        client: { name: "Тестовый клиент", phone: "+79990000000", username: null },
        message: { role: "user", text: "Это тестовое сообщение из STRIKE." },
        metadata: { source: "strike.test" },
        status: "active",
      },
    );
    const error = result.error === "skipped" ? "Укажите Webhook URL, начинающийся с http:// или https://." : result.error;
    return Response.json(
      { ok: result.ok, status: result.status, ...(error ? { error } : {}) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить тест.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ ok: false, status: 0, error: message }, { status });
  }
}

async function readSavedWebhook(agentId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("agents").select("name, webhook_url, webhook_secret").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (error) {
    if (/webhook_url|webhook_secret|schema cache/i.test(error.message)) {
      const name = await supabase.from("agents").select("name").eq("id", agentId).eq("user_id", userId).maybeSingle();
      return { name: typeof name.data?.name === "string" ? name.data.name : "Агент", url: "", secret: "" };
    }
    throw new Error(error.message);
  }
  return {
    name: typeof data?.name === "string" && data.name.trim() ? data.name : "Агент",
    url: typeof data?.webhook_url === "string" ? data.webhook_url.trim() : "",
    secret: typeof data?.webhook_secret === "string" ? data.webhook_secret.trim() : "",
  };
}
