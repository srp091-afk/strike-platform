import "server-only";

import { toFile } from "openai";

import { downloadEvolutionMedia } from "@/lib/evolution-api";
import { type EvolutionInboundMedia } from "@/lib/evolution-inbound";
import { downloadGreenFile, type GreenCredentials } from "@/lib/green-api";
import { extractDocumentText } from "@/lib/knowledge";
import { getOpenAI } from "@/lib/openai";

export type WhatsAppMedia = {
  kind: "audio" | "image";
  chatId: string;
  messageId: string;
  downloadUrl: string;
  mimeType: string;
  fileName: string;
  caption: string;
};

export type VisionImage = {
  mimeType: string;
  base64: string;
};

const AUDIO_TYPES = new Set(["audioMessage", "voiceMessage", "pttMessage"]);

export function readGreenMedia(
  messageData: Record<string, unknown>,
  chatId: string,
  messageId: string,
): WhatsAppMedia | null {
  if (!chatId || !messageId) return null;
  const type = text(messageData.typeMessage);
  if (AUDIO_TYPES.has(type)) {
    const data = record(messageData.audioMessageData ?? messageData.voiceMessageData ?? messageData.fileMessageData);
    return {
      kind: "audio",
      chatId,
      messageId,
      downloadUrl: text(data.downloadUrl),
      mimeType: cleanMime(text(data.mimeType), "audio/ogg"),
      fileName: text(data.fileName),
      caption: "",
    };
  }
  if (type === "imageMessage") {
    const data = record(messageData.imageMessageData);
    return {
      kind: "image",
      chatId,
      messageId,
      downloadUrl: text(data.downloadUrl),
      mimeType: cleanMime(text(data.mimeType), "image/jpeg"),
      fileName: text(data.fileName),
      caption: text(data.caption).slice(0, 8000),
    };
  }
  return null;
}

export async function resolveWhatsAppMedia(media: WhatsAppMedia, credentials: GreenCredentials) {
  const file = await downloadGreenFile(
    { chatId: media.chatId, messageId: media.messageId, downloadUrl: media.downloadUrl },
    credentials,
  );
  const mimeType = file.mimeType.startsWith(media.kind === "audio" ? "audio/" : "image/")
    ? file.mimeType
    : media.mimeType;

  if (media.kind === "audio") {
    const transcript = await transcribeAudio(file.bytes, mimeType, media.fileName);
    if (!transcript) throw new Error("Whisper вернул пустую расшифровку.");
    return { text: transcript.slice(0, 8000), image: null };
  }

  return {
    text: media.caption || "Изображение",
    image: {
      mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
      base64: file.bytes.toString("base64"),
    } satisfies VisionImage,
  };
}

/** Голос → Whisper, фото → Vision, pdf/docx/txt/csv/xlsx → текст файла. */
export async function resolveEvolutionMedia(instanceName: string, media: EvolutionInboundMedia) {
  const downloaded = media.base64
    ? { base64: media.base64, mimeType: media.mimeType, fileName: media.fileName }
    : await downloadEvolutionMedia(instanceName, media.key, media.message);
  const mimeType = cleanMime(downloaded.mimeType || media.mimeType, defaultMime(media.kind));
  const fileName = downloaded.fileName || media.fileName || defaultFileName(media.kind, mimeType);
  const bytes = Buffer.from(downloaded.base64, "base64");
  if (bytes.length < 8) throw new Error("Пустой медиафайл.");

  if (media.kind === "audio" || mimeType.startsWith("audio/")) {
    const transcript = await transcribeAudio(bytes, mimeType.startsWith("audio/") ? mimeType : "audio/ogg", fileName);
    if (!transcript) throw new Error("Whisper вернул пустую расшифровку.");
    const lead = media.lead.trim();
    const text = lead.startsWith(">") ? `${lead}\n${transcript}` : transcript;
    return { text: text.slice(0, 8000), image: null };
  }

  if (media.kind === "image" || mimeType.startsWith("image/")) {
    const caption = media.lead.trim() || media.caption.trim() || "Изображение";
    if (bytes.length > 8_000_000) return { text: caption.slice(0, 8000), image: null };
    return {
      text: caption.slice(0, 8000),
      image: {
        mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg",
        base64: bytes.toString("base64"),
      } satisfies VisionImage,
    };
  }

  let extracted: string | null = null;
  try {
    extracted = await extractDocumentText(fileName, mimeType, bytes);
  } catch (error) {
    console.error("[evolution media] document", error instanceof Error ? error.message : error);
  }
  const name = fileName || "файл";
  const caption = media.lead.trim() || media.caption.trim();
  const head = [`Клиент прислал файл «${name}».`, caption ? `Подпись: ${caption}` : ""].filter(Boolean).join("\n");
  return { text: (extracted ? `${head}\n\n${extracted}` : head).slice(0, 8000), image: null };
}

function defaultMime(kind: EvolutionMediaKind) {
  if (kind === "audio") return "audio/ogg";
  if (kind === "image") return "image/jpeg";
  return "application/octet-stream";
}

function defaultFileName(kind: EvolutionMediaKind, mimeType: string) {
  if (kind === "audio") return audioName("", mimeType);
  if (kind === "image") return "image.jpg";
  return "file";
}

type EvolutionMediaKind = EvolutionInboundMedia["kind"];

export function visionModel(agentModel: string) {
  if (/gpt-4o|gpt-4\.1|gpt-5|gpt-4-turbo/i.test(agentModel)) return agentModel;
  return "gpt-4o";
}

async function transcribeAudio(bytes: Buffer, mimeType: string, fileName: string) {
  const file = await toFile(bytes, audioName(fileName, mimeType), { type: mimeType || "audio/ogg" });
  const result = await getOpenAI().audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text.trim();
}

function audioName(fileName: string, mimeType: string) {
  if (/\.[a-z0-9]+$/i.test(fileName)) return fileName;
  if (mimeType.includes("mpeg")) return "voice.mp3";
  if (mimeType.includes("mp4")) return "voice.mp4";
  if (mimeType.includes("wav")) return "voice.wav";
  if (mimeType.includes("webm")) return "voice.webm";
  return "voice.ogg";
}

function cleanMime(value: string, fallback: string) {
  const mime = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return mime || fallback;
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
