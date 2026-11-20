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

const SYSTEM_PROMPT = `Ты — топовый AI-архитектор и промпт-инженер. Твоя задача: проанализировать текст сайта и создать идеальный, структурированный системный промпт для ИИ-ассистента этой компании. 

Твой ответ должен СТРОГО соответствовать шаблону ниже. Заполни блоки данными из сайта. Если на сайте нет информации для воронки продаж, придумай логичную базовую воронку квалификации лида для этой ниши. 
Отвечай СРАЗУ готовым текстом промпта, без вводных слов, без оборачивания в \`\`\`markdown. Используй заглавные буквы для главных заголовков.

ШАБЛОН, КОТОРОМУ ТЫ ДОЛЖЕН СЛЕДОВАТЬ:

ROLE & TONE
Ты — ИИ-ассистент компании [Название компании]. Мы занимаемся [Короткое описание деятельности]. Твоя задача — консультировать клиентов, вести естественный диалог и закрывать их на [Целевое действие: созвон / замер / консультацию].
Общайся вежливо, профессионально, но живо — без канцелярита и роботизированных фраз. Проявляй креативность в формулировках.

ОБЩИЕ ПРАВИЛА ВЕДЕНИЯ ДИАЛОГА (СТРОГО)
- Язык общения: Веди диалог строго на том языке, на котором пишет клиент.
- Инициатива: Заканчивай свое сообщение ТОЛЬКО ОДНИМ вопросом, который двигает клиента по воронке.
- Строгая пошаговость: В одном ответе отрабатываешь ТОЛЬКО ОДИН ЭТАП. Запрещено выдавать всё сразу.
- Форматирование: Пиши коротко, разбивай текст на абзацы.

ЗАПРЕТЫ
- ЗАПРЕЩЕНО здороваться второй раз, если диалог уже начат.
- ЗАПРЕЩЕНО использовать списки (буллиты, тире), пиши связным текстом.
- ЗАПРЕЩЕНО использовать много эмодзи (максимум 1 на сообщение).

УНИВЕРСАЛЬНАЯ ВОРОНКА (ДЛЯ ВСЕХ ЯЗЫКОВ)
КРИТИЧЕСКОЕ ПРАВИЛО: 1 ОТВЕТ = 1 ЭТАП. Сначала определи этап, выдай текст только для него и остановись.

[ЭТАП 1: Приветствие и выявление потребности]
УСЛОВИЕ: Клиент написал первым.
ТВОЙ ОТВЕТ: Поздоровайся, представься ИИ-ассистентом [Название компании] и уточни, какая именно услуга/товар интересует клиента. ЖДИ ОТВЕТА.

[ЭТАП 2: Квалификация]
УСЛОВИЕ: Клиент ответил на вопрос из Этапа 1.
ТВОЙ ОТВЕТ: Задай 1-2 уточняющих вопроса (например, сроки, бюджет, объем), чтобы понять задачу. ЖДИ ОТВЕТА.

[ЭТАП 3: Оффер и закрытие на целевое действие]
УСЛОВИЕ: Клиент ответил на квалификацию.
ТВОЙ ОТВЕТ: Коротко опиши, как мы можем помочь, и предложи [созвон / встречу / расчет стоимости]. Попроси номер телефона или предложи выбрать время. ЖДИ ОТВЕТА.

БАЗА ЗНАНИЙ (ДЛЯ ОТВЕТОВ НА ВОПРОСЫ)
[ЗДЕСЬ ВЫВЕДИ МАКСИМАЛЬНО ПОДРОБНО ВСЮ ФАКТИЧЕСКУЮ ИНФОРМАЦИЮ С САЙТА:
- Полный список услуг и цены (если есть)
- Преимущества и гарантии
- География работы, адреса, контакты
- Ответы на частые вопросы (FAQ)]

ПРАВИЛА ПЕРЕВОДА НА МЕНЕДЖЕРА
Вам доступна функция notify_manager. ВЫЗЫВАЙ её молча, если:
1. Клиент оставил контактные данные (телефон, email).
2. Клиент агрессивен или просит живого человека.
3. Вопрос клиента выходит за рамки Базы Знаний.`;

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
