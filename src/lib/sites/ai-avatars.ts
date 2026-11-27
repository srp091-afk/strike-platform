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

export const AI_AVATARS: AiAvatarPreset[] = [
  portrait("alexei", "Алексей Громов", "Недвижимость", "Эксперт по объектам", "#1C1917", "#2A2420", "#E7CDB8", "#3F3A36", "#C4A484", ["ru", "en"]),
  portrait("mark", "Марк Эллис", "Финансы", "Советник по капиталу", "#0F172A", "#1E293B", "#F0D2BE", "#334155", "#94A3B8", ["ru", "en", "de"]),
  portrait("ivan", "Иван Петров", "Архитектура", "Руководитель проектов", "#292524", "#44403C", "#E8C8B0", "#57534E", "#A8A29E", ["ru", "en"]),
  portrait("elena", "Елена Соколова", "Недвижимость", "Руководитель отдела", "#3F2E2A", "#5C4038", "#F3D5C4", "#7A5A52", "#E7C4B0", ["ru", "en", "es"]),
  portrait("anna", "Анна Келлер", "Медицина", "Куратор программ", "#3B2A33", "#5A3D4A", "#F6D7CC", "#8A6570", "#E8C8D0", ["ru", "en", "de"]),
  portrait("maria", "Мария Волкова", "Консалтинг", "Партнёр практики", "#18181B", "#27272A", "#F0D0C0", "#3F3F46", "#D4D4D8", ["ru", "en", "es"]),
];

export function findAvatar(id: string | null | undefined) {
  return AI_AVATARS.find((item) => item.id === id) ?? null;
}

function portrait(id: string, name: string, styleTag: string, roleHint: string, bg: string, hair: string, skin: string, cloth: string, accent: string, languages: VoiceLocale[]): AiAvatarPreset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200"><rect width="160" height="200" fill="${bg}"/><ellipse cx="80" cy="78" rx="34" ry="38" fill="${skin}"/><path d="M46 74c2-28 22-42 34-42s32 14 34 42c-8-10-18-14-34-14s-26 4-34 14z" fill="${hair}"/><path d="M28 200c6-42 24-64 52-64s46 22 52 64" fill="${cloth}"/><rect x="62" y="118" width="36" height="6" rx="3" fill="${accent}"/></svg>`;
  return {
    id,
    name,
    styleTag,
    roleHint,
    previewImageUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    accentTone: accent,
    languages,
  };
}
