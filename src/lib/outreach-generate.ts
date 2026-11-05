import "server-only";

import { fetchSiteMarkdown } from "@/lib/jina-reader";
import { normalizeAgentModel } from "@/lib/agent-models";
import { getOpenAI } from "@/lib/openai";
import { renderFixedMessage, type OutreachMapping, type OutreachMessageType } from "@/lib/outreach-types";

export type OutreachStep = { label: string; ok: boolean; detail?: string };

export type GenerateInput = {
  outreachPrompt: string;
  agentName: string;
  agentPrompt: string;
  channelLabel: string;
  contact: Record<string, string>;
  messageType: OutreachMessageType;
  fixedMessage: string;
  mapping: OutreachMapping;
  /** Модель выбранного агента (agents.model); при отсутствии — gpt-4o. */
  model: unknown;
};

export type GenerateResult =
  | { ok: true; message: string; steps: OutreachStep[] }
  | { ok: false; error: string; steps: OutreachStep[] };

/**
 * Общий конвейер для песочницы и воркера.
 * «Точный текст»: нейросеть и парсинг сайта не вызываются, переменные подставляются из строки базы.
 * «AI-генерация»: парсинг сайта (Jina) -> генерация моделью выбранного агента.
 */
export async function generateOutreachMessage(input: GenerateInput): Promise<GenerateResult> {
  const steps: OutreachStep[] = [];

  if (input.messageType === "fixed") {
    const message = renderFixedMessage(input.fixedMessage, input.contact, input.mapping);
    if (!message) {
      steps.push({ label: "Точный текст", ok: false, detail: "после подстановки переменных текст пуст" });
      return { ok: false, error: "Текст сообщения пуст после подстановки переменных", steps };
    }
    steps.push({ label: "Точный текст", ok: true, detail: "нейросеть не вызывалась" });
    return { ok: true, message, steps };
  }

  const site = input.mapping.website ? (input.contact[input.mapping.website] ?? "") : "";
  const name = input.mapping.name ? (input.contact[input.mapping.name] ?? "").trim() : "";
  const social = input.mapping.social ? (input.contact[input.mapping.social] ?? "").trim() : "";
  const model = normalizeAgentModel(input.model);

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
    steps.push({ label: "Модель агента", ok: true, detail: model });
    const completion = await getOpenAI().chat.completions.create({
      model,
      // Линейка gpt-6 принимает только температуру по умолчанию (как и в чате агента).
      temperature: model.includes("gpt-6") ? 1 : 0.7,
      messages: [
        {
          role: "system",
          content: [
            `Ты — ИИ-агент «${input.agentName}». Базовая роль агента:`,
            input.agentPrompt.slice(0, 3000),
            "",
            `Сейчас ты пишешь ПЕРВОЕ холодное сообщение клиенту в ${input.channelLabel}. Отвечай только текстом сообщения: без markdown, без заголовков, без пояснений, без плейсхолдеров вроде [Имя]. Пиши на языке сайта/контакта, коротко и по-человечески.`,
            "Если указаны имя и ссылки на соцсети контакта, опирайся на них так же, как на сайт: учитывай имя в обращении, а по соцсетям понимай, чем занимается человек или компания.",
            "",
            "Инструкция пользователя для первого сообщения:",
            input.outreachPrompt,
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Данные контакта:\n${JSON.stringify(input.contact)}`,
            name ? `Имя контакта: ${name}` : "Имя контакта не указано.",
            social ? `Соцсети контакта: ${social}` : "Соцсети контакта не указаны.",
            "",
            siteBlock,
          ].join("\n"),
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
