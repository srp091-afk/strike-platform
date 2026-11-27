import type { VoiceLocale } from "@/lib/sites/quiz-schema";

export type AiAvatarPreset = {
  id: string;
  name: string;
  styleTag: string;
  roleHint: string;
  previewImageUrl: string;
  accentTone: string;
  languages: VoiceLocale[];
};

type Look = {
  bg: string;
  hair: string;
  skin: string;
  cloth: string;
  accent: string;
  haircut: "crop" | "side" | "beard" | "long" | "bob" | "tied";
};

export const AI_AVATARS: AiAvatarPreset[] = [
  person("alexei", "Алексей Громов", "Недвижимость", "Эксперт по объектам", { bg: "#E7E1D8", hair: "#2A241F", skin: "#E7C4A8", cloth: "#2C2825", accent: "#C4A484", haircut: "crop" }, ["ru", "en"]),
  person("mark", "Марк Эллис", "Финансы", "Советник по капиталу", { bg: "#E4E8EE", hair: "#1E293B", skin: "#F0D0B8", cloth: "#1E293B", accent: "#94A3B8", haircut: "side" }, ["ru", "en", "de"]),
  person("ivan", "Иван Петров", "Архитектура", "Руководитель проектов", { bg: "#E8E2DA", hair: "#3F342C", skin: "#E8C8B0", cloth: "#44403C", accent: "#A8A29E", haircut: "beard" }, ["ru", "en"]),
  person("elena", "Елена Соколова", "Недвижимость", "Руководитель отдела", { bg: "#F0E6DE", hair: "#4A3028", skin: "#F3D0BE", cloth: "#6B4A42", accent: "#E7C4B0", haircut: "long" }, ["ru", "en", "es"]),
  person("anna", "Анна Келлер", "Медицина", "Куратор программ", { bg: "#F3E8EA", hair: "#3B2A33", skin: "#F6D5C8", cloth: "#7A5A64", accent: "#E8C8D0", haircut: "bob" }, ["ru", "en", "de"]),
  person("maria", "Мария Волкова", "Консалтинг", "Партнёр практики", { bg: "#E8E8EA", hair: "#27272A", skin: "#F0D0C0", cloth: "#3F3F46", accent: "#D4D4D8", haircut: "tied" }, ["ru", "en", "es"]),
];

export function findAvatar(id: string | null | undefined) {
  return AI_AVATARS.find((item) => item.id === id) ?? null;
}

export function consultantPortrait(consultant: { avatarUrl: string | null; aiAvatarId: string | null }) {
  if (consultant.avatarUrl) return consultant.avatarUrl;
  return findAvatar(consultant.aiAvatarId)?.previewImageUrl ?? null;
}

function person(id: string, name: string, styleTag: string, roleHint: string, look: Look, languages: VoiceLocale[]): AiAvatarPreset {
  const hair = hairPath(look.haircut, look.hair);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="${look.bg}"/><path d="M6 100c6-24 18-36 34-36s28 12 34 36" fill="${look.cloth}"/><path d="M30 78h20l-2 10H32z" fill="${look.skin}"/><path d="M28 70h24v6H28z" fill="${look.accent}"/><ellipse cx="40" cy="46" rx="16" ry="18" fill="${look.skin}"/>${hair}<ellipse cx="34" cy="46" rx="1.5" ry="1.7" fill="#2A2420"/><ellipse cx="47" cy="46" rx="1.5" ry="1.7" fill="#2A2420"/><path d="M34 54c2.2 2.2 7.2 2.2 9.4 0" fill="none" stroke="#B88878" stroke-width="1.1" stroke-linecap="round"/></svg>`;
  return { id, name, styleTag, roleHint, previewImageUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, accentTone: look.accent, languages };
}

function hairPath(cut: Look["haircut"], color: string) {
  if (cut === "long") return `<path d="M24 48c0-18 8-28 16-28s16 10 16 28c2 8 4 20 4 28H22c0-10 2-18 2-28z" fill="${color}"/><path d="M26 34c4-12 10-16 14-16s10 4 14 16c-6-6-10-8-14-8s-8 2-14 8z" fill="${color}"/>`;
  if (cut === "bob") return `<path d="M24 40c1-16 8-24 16-24s15 8 16 24c1 10 2 16 2 20H22c0-6 1-12 2-20z" fill="${color}"/>`;
  if (cut === "tied") return `<path d="M25 42c1-16 8-24 15-24s14 8 15 24c-4-8-8-10-15-10s-11 2-15 10z" fill="${color}"/><circle cx="40" cy="22" r="4" fill="${color}"/>`;
  if (cut === "side") return `<path d="M24 44c1-18 8-26 16-26 10 0 16 8 16 22-8-8-14-10-20-8-4 8-8 10-12 12z" fill="${color}"/>`;
  if (cut === "beard") return `<path d="M24 42c1-16 8-24 16-24s15 8 16 22c-6-8-12-10-16-10s-10 2-16 12z" fill="${color}"/><path d="M28 52c2 10 8 14 12 14s10-4 12-14c-4 4-8 6-12 6s-8-2-12-6z" fill="${color}"/>`;
  return `<path d="M24 42c1-16 8-24 16-24s15 8 16 22c-6-8-12-10-16-10s-10 2-16 12z" fill="${color}"/>`;
}
