/** Типы и константы идей/канбана SMM (без server-only: используются и на клиенте). */

export const SMM_IDEA_STATUSES = ["idea", "in_progress", "ready", "published"] as const;
export type SmmIdeaStatus = (typeof SMM_IDEA_STATUSES)[number];

export const SMM_VIDEO_FORMATS = ["avatar", "broll", "overlay", "none"] as const;
export type SmmVideoFormat = (typeof SMM_VIDEO_FORMATS)[number];

export const SMM_CHANNELS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "threads", label: "Threads" },
  { id: "youtube", label: "YouTube Shorts" },
] as const;
export type SmmChannelId = (typeof SMM_CHANNELS)[number]["id"];

export const SMM_PERIODS = {
  day: { label: "День", count: 2 },
  week: { label: "Неделя", count: 5 },
  month: { label: "Месяц", count: 15 },
} as const;
export type SmmPeriod = keyof typeof SMM_PERIODS;

export type SmmIdea = {
  id: string;
  title: string;
  content: string;
  status: SmmIdeaStatus;
  videoFormat: SmmVideoFormat;
  voiceoverText: string;
  visualPrompt: string;
  scheduledTime: string | null;
  channels: SmmChannelId[];
};

export type SmmIdeaEdit = {
  title: string;
  content: string;
  videoFormat: SmmVideoFormat;
  voiceoverText: string;
  visualPrompt: string;
};
