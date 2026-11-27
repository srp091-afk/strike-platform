import { connection } from "next/server";
import { promises as dns } from "node:dns";

import { normalizeCustomDomain } from "@/lib/sites/domains";
import { getOwnedSite } from "@/lib/sites/store";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  try {
    const site = await getOwnedSite(id);
    if (!site?.customDomain) return Response.json({ ok: false, status: "error", detail: "Сначала сохраните домен." }, { status: 400 });
    const domain = normalizeCustomDomain(site.customDomain);
    if (!domain.ok) return Response.json({ ok: false, status: "error", detail: domain.reason }, { status: 400 });
    const matched = await dnsMatches(domain.domain);
    const admin = createSupabaseAdminClient();
    const status = matched ? "active" : "pending_dns";
    await admin.from("landings").update({ domain_status: status, custom_domain: domain.domain }).eq("id", id).eq("user_id", site.userId);
    return Response.json({
      ok: matched,
      status,
      detail: matched ? "DNS указывает на STRIKE." : "Запись ещё не видна. Подождите и проверьте снова.",
    });
  } catch (error) {
    return Response.json({ ok: false, status: "error", detail: error instanceof Error ? error.message : "Проверка не удалась." }, { status: 500 });
  }
}

async function dnsMatches(domain: string) {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && projectId) {
    const response = await fetch(`https://api.vercel.com/v9/projects/${projectId}/domains/${domain}`, {
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (response?.ok) {
      const body = (await response.json()) as { verified?: boolean };
      if (body.verified) return true;
    }
  }
  const cname = await dns.resolveCname(domain).catch(() => [] as string[]);
  if (cname.some((item) => item.replace(/\.$/, "") === "cname.vercel-dns.com")) return true;
  const addresses = await dns.resolve4(domain).catch(() => [] as string[]);
  return addresses.includes("76.76.21.21");
}
