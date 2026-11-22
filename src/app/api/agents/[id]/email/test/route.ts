import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { readMailAddress, readMailHost, readMailPassword, readMailPort, testEmailConnection } from "@/lib/email-channel";
import { ownedAgent } from "@/lib/google-calendar";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const saved = await savedMail(id);
    const email = readMailAddress(text(body?.email) || saved.email);
    const imapHost = readMailHost(text(body?.imapHost) || saved.imapHost);
    const smtpHost = readMailHost(text(body?.smtpHost) || saved.smtpHost);
    const imapPort = readMailPort(text(body?.imapPort) || String(saved.imapPort || ""), 993);
    const smtpPort = readMailPort(text(body?.smtpPort) || String(saved.smtpPort || ""), 465);
    const password = readMailPassword(typeof body?.password === "string" ? body.password : "") || saved.password;
    if (email === null) return Response.json({ ok: false, error: "Укажите корректный email." }, { status: 400 });
    if (imapHost === null || smtpHost === null) return Response.json({ ok: false, error: "Проверьте хосты IMAP и SMTP." }, { status: 400 });
    if (imapPort === null || smtpPort === null) return Response.json({ ok: false, error: "Порт должен быть числом от 1 до 65535." }, { status: 400 });
    if (!email || !password || !imapHost || !smtpHost) {
      return Response.json({ ok: false, error: "Заполните почту, пароль и хосты IMAP/SMTP." }, { status: 400 });
    }

    const result = await testEmailConnection({ email, password, imapHost, imapPort, smtpHost, smtpPort });
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить почту.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /email_|schema cache/i.test(message) ? "Примените миграцию 20261122_agent_viber_email.sql." : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}

async function savedMail(agentId: string) {
  const empty = { email: "", password: "", imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 465 };
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("email_address, email_password, email_imap_host, email_imap_port, email_smtp_host, email_smtp_port")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return empty;
  return {
    email: text(data.email_address),
    password: text(data.email_password),
    imapHost: text(data.email_imap_host),
    imapPort: Number(data.email_imap_port) || 993,
    smtpHost: text(data.email_smtp_host),
    smtpPort: Number(data.email_smtp_port) || 465,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
