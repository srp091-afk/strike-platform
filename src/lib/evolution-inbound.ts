/** Разбор входящего messages.upsert Evolution API. Без сети и без ключей. */

export type EvolutionMediaKind = "audio" | "image" | "document";

export type EvolutionInboundMedia = {
  kind: EvolutionMediaKind;
  mimeType: string;
  fileName: string;
  caption: string;
  /** Текст, который уже есть в сообщении: ссылка, цитата, подпись. */
  lead: string;
  base64: string | null;
  key: Record<string, unknown>;
  /** Полное событие без base64 — для повторной загрузки, если в вебхуке файла нет. */
  message: unknown;
};

export type EvolutionInbound = {
  text: string;
  media: EvolutionInboundMedia | null;
};

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
  "associatedChildMessage",
];

export function readEvolutionContent(item: unknown): EvolutionInbound {
  const data = asRecord(item);
  const inner = unwrap(asRecord(data.message));
  const mediaNode = readMediaNode(inner);
  const lead = messageText(inner, 0).slice(0, 8000);
  const base64 = readInlineBase64(data, inner);
  const media = mediaNode
    ? {
        kind: mediaNode.kind,
        mimeType: mediaNode.mimeType,
        fileName: mediaNode.fileName,
        caption: mediaNode.caption,
        lead,
        base64,
        key: asRecord(data.key),
        message: base64 ? null : stripHeavy(data),
      }
    : null;
  const text = (lead || placeholder(media) || passiveLabel(data, inner)).slice(0, 8000);
  return { text, media };
}

function placeholder(media: EvolutionInboundMedia | null) {
  if (!media) return "";
  if (media.kind === "audio") return "Голосовое сообщение";
  if (media.kind === "image") return "Изображение";
  return media.fileName ? `Документ: ${media.fileName}` : "Документ";
}

function passiveLabel(data: Record<string, unknown>, inner: Record<string, unknown>) {
  const type = text(data.messageType).toLowerCase();
  if (type.includes("sticker") || inner.stickerMessage) return "Клиент прислал стикер.";
  if (type.includes("video") || inner.videoMessage) {
    const caption = text(asRecord(inner.videoMessage).caption);
    return caption ? `Клиент прислал видео. ${caption}` : "Клиент прислал видео.";
  }
  if (inner.contactMessage || inner.contactsArrayMessage) {
    const name = text(asRecord(inner.contactMessage).displayName);
    return name ? `Клиент прислал контакт: ${name}` : "Клиент прислал контакт.";
  }
  if (inner.locationMessage || inner.liveLocationMessage) {
    const loc = asRecord(inner.locationMessage);
    const name = text(loc.name) || text(loc.address);
    return name ? `Клиент прислал геолокацию: ${name}` : "Клиент прислал геолокацию.";
  }
  return "";
}

function readMediaNode(inner: Record<string, unknown>): {
  kind: EvolutionMediaKind;
  mimeType: string;
  fileName: string;
  caption: string;
} | null {
  const audio = asRecord(inner.audioMessage ?? inner.pttMessage);
  if (Object.keys(audio).length > 0) {
    return {
      kind: "audio",
      mimeType: cleanMime(text(audio.mimetype), "audio/ogg"),
      fileName: text(audio.fileName) || "voice.ogg",
      caption: "",
    };
  }
  const image = asRecord(inner.imageMessage);
  if (Object.keys(image).length > 0) {
    return {
      kind: "image",
      mimeType: cleanMime(text(image.mimetype), "image/jpeg"),
      fileName: text(image.fileName) || "image.jpg",
      caption: text(image.caption).slice(0, 8000),
    };
  }
  const document = asRecord(inner.documentMessage);
  if (Object.keys(document).length > 0) {
    const mimeType = cleanMime(text(document.mimetype), "application/octet-stream");
    const fileName = text(document.fileName) || text(document.title) || "file";
    if (mimeType.startsWith("image/")) {
      return { kind: "image", mimeType, fileName, caption: text(document.caption).slice(0, 8000) };
    }
    if (mimeType.startsWith("audio/")) {
      return { kind: "audio", mimeType, fileName, caption: "" };
    }
    return {
      kind: "document",
      mimeType,
      fileName,
      caption: text(document.caption).slice(0, 8000),
    };
  }
  return null;
}

function messageText(message: unknown, depth: number): string {
  if (depth > 4) return "";
  const record = unwrap(asRecord(message));
  const conversation = typeof record.conversation === "string" ? record.conversation.trim() : "";
  const extended = asRecord(record.extendedTextMessage);
  const extendedText = text(extended.text);
  const link = text(extended.canonicalUrl) || text(extended.matchedText);
  let body = conversation || extendedText;
  if (link && body && !body.includes(link)) body = `${body}\n${link}`;
  if (!body && link) body = link;
  if (!body) {
    body =
      text(asRecord(record.buttonsResponseMessage).selectedDisplayText) ||
      text(asRecord(record.templateButtonReplyMessage).selectedDisplayText) ||
      text(asRecord(record.listResponseMessage).title) ||
      text(asRecord(asRecord(record.listResponseMessage).singleSelectReply).selectedRowId) ||
      text(asRecord(record.imageMessage).caption) ||
      text(asRecord(record.videoMessage).caption) ||
      text(asRecord(record.documentMessage).caption);
  }
  const quote = depth === 0 ? quotedSnippet(record) : "";
  if (quote && body) return `> ${quote}\n${body}`;
  if (quote) return `> ${quote}`;
  return body;
}

function quotedSnippet(record: Record<string, unknown>) {
  const contexts = [
    asRecord(asRecord(record.extendedTextMessage).contextInfo),
    asRecord(asRecord(record.imageMessage).contextInfo),
    asRecord(asRecord(record.videoMessage).contextInfo),
    asRecord(asRecord(record.documentMessage).contextInfo),
    asRecord(asRecord(record.audioMessage).contextInfo),
    asRecord(record.contextInfo),
  ];
  for (const context of contexts) {
    if (!context.quotedMessage) continue;
    const quoted = messageText(context.quotedMessage, 1).replace(/\s+/g, " ").trim();
    if (quoted) return quoted.slice(0, 500);
  }
  return "";
}

function unwrap(message: Record<string, unknown>) {
  let current = message;
  for (let depth = 0; depth < 5; depth += 1) {
    const wrapper = WRAPPERS.find((key) => current[key]);
    if (!wrapper) break;
    const next = asRecord(asRecord(current[wrapper]).message);
    if (Object.keys(next).length === 0) break;
    current = next;
  }
  return current;
}

function readInlineBase64(data: Record<string, unknown>, inner: Record<string, unknown>) {
  const message = asRecord(data.message);
  const raw = text(data.base64) || text(message.base64) || text(inner.base64);
  const cleaned = raw.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  if (cleaned.length < 32) return null;
  return cleaned;
}

function stripHeavy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripHeavy);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "base64" || key === "jpegThumbnail") continue;
    out[key] = stripHeavy(item);
  }
  return out;
}

function cleanMime(value: string, fallback: string) {
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mime || fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
