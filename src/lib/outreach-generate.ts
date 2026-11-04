import "server-only";

import { fetchSiteMarkdown } from "@/lib/jina-reader";
import { getOpenAI } from "@/lib/openai";

export type OutreachStep = { label: string; ok: boolean; detail?: string };

export type GenerateInput = {
  outreachPrompt: string;
  agentName: string;
  agentPrompt: string;
  channelLabel: string;
  contact: Record<string, string>;
  websiteColumn: string | null;
};

export type GenerateResult =
  | { ok: true; message: string; steps: OutreachStep[] }
  | { ok: false; error: string; steps: OutreachStep[] };

/** Общий конвейер для песочницы и воркера: парсинг сайта (Jina) -> генерация первого сообщения. */
export async function generateOutreachMessage(input: GenerateInput): Promise<GenerateResult> {
  const steps: OutreachStep[] = [];
  const site = input.websiteColumn ? (input.contact[input.websiteColumn] ?? "") : "";

  let siteBlock = "Сайт у контакта не указан: опирайся только на данные строки.";
  if (site.trim()) {
    const parsed = await fetchSiteMarkdown(site);
    if (!parsed.ok) {
      steps.push({ label: `Парсинг сайта ${site}`, ok: false, detail: parsed.error });
      return { ok: false, error: parsed.error, steps };
    }
    steps.push({ label: `Парсинг сайта ${site}`, ok: true, detail: `${parsed.markdown.length} символов Markdown` });
    siteBlock = `Содержимое сайта (${parsed.url}):\n${parsed.markdown}`;
  } else {
    steps.push({ label: "Парсинг сайта", ok: true, detail: "пропущен: колонка сайта пуста" });
  }

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: [
            `Ты — ИИ-агент «${input.agentName}». Базовая роль агента:`,
            input.agentPrompt.slice(0, 3000),
            "",
            `Сейчас ты пишешь ПЕРВОЕ холодное сообщение клиенту в ${input.channelLabel}. Отвечай только текстом сообщения: без markdown, без заголовков, без пояснений, без плейсхолдеров вроде [Имя]. Пиши на языке сайта/контакта, коротко и по-человечески.`,
            "",
            "Инструкция пользователя для первого сообщения:",
            input.outreachPrompt,
          ].join("\n"),
        },
        {
          role: "user",
          content: `Данные контакта:\n${JSON.stringify(input.contact)}\n\n${siteBlock}`,
        },
      ],
    });
    const message = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!message) {
      steps.push({ label: "Генерация текста", ok: false, detail: "пустой ответ модели" });
      return { ok: false, error: "Модель вернула пустой текст", steps };
    }
    steps.push({ label: "Генерация текста", ok: true });
    return { ok: true, message, steps };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "ошибка модели";
    steps.push({ label: "Генерация текста", ok: false, detail });
    return { ok: false, error: `Ошибка генерации: ${detail}`, steps };
  }
}
