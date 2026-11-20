import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { fetchSiteMarkdown, normalizeSiteUrl } from "@/lib/jina-reader";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 60;

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:markdown|html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

const SYSTEM_PROMPT =
  "Ты — эксперт по настройке AI-агентов. Твоя задача: проанализировать текст сайта и составить детальный системный промпт для ИИ-ассистента этой компании. Вытащи: название компании, тон общения, список услуг, цены, контакты и главные правила. Отвечай только готовым текстом промпта (без вводных слов), используй маркдаун-списки.";

function blockedHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host === "0.0.0.0") {
    return true;
  }
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

function publicSiteUrl(raw: string) {
  const normalized = normalizeSiteUrl(raw);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || blockedHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const rawUrl = body && typeof body === "object" && "url" in body && typeof body.url === "string" ? body.url : "";
  const url = publicSiteUrl(rawUrl);
  if (!url) return Response.json({ error: "Введите корректный адрес сайта." }, { status: 400 });

  const site = await fetchSiteMarkdown(url);
  if (!site.ok) return Response.json({ error: site.error }, { status: 422 });

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: site.markdown },
      ],
    });
    const prompt = stripCodeFence(completion.choices[0]?.message?.content ?? "");
    if (!prompt) return Response.json({ error: "Модель не вернула инструкцию." }, { status: 502 });
    return Response.json({ prompt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[parse-website]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Не удалось составить инструкцию." }, { status: 502 });
  }
}
