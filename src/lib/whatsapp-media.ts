import "server-only";

import { toFile } from "openai";

import { downloadGreenFile, type GreenCredentials } from "@/lib/green-api";
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
