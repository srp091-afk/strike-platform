import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { messengerColumnError, unsubscribePageFromApp } from "@/lib/messenger";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const { data, error: readError } = await owned.admin
      .from("agents")
      .select("fb_page_id, fb_page_access_token")
      .eq("id", id)
      .eq("user_id", owned.userId)
      .maybeSingle();
    if (readError) return Response.json({ ok: false, error: messengerColumnError(readError.message) }, { status: 500 });

    const pageId = typeof data?.fb_page_id === "string" ? data.fb_page_id : "";
    const token = typeof data?.fb_page_access_token === "string" ? data.fb_page_access_token : "";
    if (pageId && token) {
      const dropped = await unsubscribePageFromApp(pageId, token);
      if (!dropped.ok) console.error("[messenger] unsubscribe", dropped.error);
    }

    const { error } = await owned.admin
      .from("agents")
      .update({ fb_page_id: null, fb_page_name: null, fb_page_access_token: null, fb_messenger_enabled: false })
      .eq("id", id)
      .eq("user_id", owned.userId);
    if (error) return Response.json({ ok: false, error: messengerColumnError(error.message) }, { status: 500 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отключить Messenger.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ ok: false, error: message }, { status });
  }
}
