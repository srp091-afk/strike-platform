import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getCampaign, listLogs } from "@/lib/outreach";
import { generateOutreachMessage } from "@/lib/outreach-generate";
import { OUTREACH_CHANNELS } from "@/lib/outreach-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

/** Песочница: берёт первую строку базы, парсит сайт (Jina), генерирует текст. Ничего не отправляет и не пишет в БД. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId();
    const campaign = await getCampaign(userId, id);
    if (!campaign) return Response.json({ error: "Рассылка не найдена." }, { status: 404 });
    if (!campaign.agent_id || !campaign.channel_type) return Response.json({ error: "Сначала выберите агента и канал." }, { status: 400 });
    if (!campaign.outreach_prompt.trim()) return Response.json({ error: "Заполните инструкцию для первого сообщения." }, { status: 400 });

    const [first] = await listLogs(id, 1);
    if (!first) return Response.json({ error: "Сначала загрузите базу контактов." }, { status: 400 });

    const { data: agent } = await createSupabaseAdminClient()
      .from("agents")
      .select("name, system_prompt")
      .eq("id", campaign.agent_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!agent) return Response.json({ error: "Агент не найден." }, { status: 400 });

    const result = await generateOutreachMessage({
      outreachPrompt: campaign.outreach_prompt,
      agentName: String(agent.name),
      agentPrompt: String(agent.system_prompt ?? ""),
      channelLabel: OUTREACH_CHANNELS.find((item) => item.value === campaign.channel_type)?.label ?? campaign.channel_type,
      contact: first.contact_data,
      websiteColumn: campaign.website_column,
    });
    return Response.json({ contact: first.contact_data, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сгенерировать тест." }, { status: 500 });
  }
}
