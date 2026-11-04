import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getCampaign, listLogs } from "@/lib/outreach";

function cell(value: string) {
  // Защита от CSV-инъекций в Excel/Google Sheets: формулы начинаются с = + - @.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Обогащённый экспорт: исходная база + системные колонки STRIKE. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId();
    const campaign = await getCampaign(userId, id);
    if (!campaign) return Response.json({ error: "Рассылка не найдена." }, { status: 404 });

    const logs = await listLogs(id, 5000);
    const header = [...campaign.source_columns, "STRIKE_Status", "STRIKE_Sent_Time", "STRIKE_Message"];
    const lines = [header.map(cell).join(",")];
    for (const log of logs) {
      lines.push(
        [
          ...campaign.source_columns.map((column) => log.contact_data[column] ?? ""),
          log.strike_status,
          log.strike_sent_time ?? "",
          log.strike_message ?? log.strike_error ?? "",
        ]
          .map(cell)
          .join(","),
      );
    }
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="outreach-${id.slice(0, 8)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось экспортировать." }, { status: 500 });
  }
}
