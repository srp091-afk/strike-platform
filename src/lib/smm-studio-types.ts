/** Типы и лимиты AI-Видеостудии (без server-only: используются и на клиенте). */

export const STUDIO_STYLES = ["avatar", "captions", "overlay"] as const;
export type StudioStyle = (typeof STUDIO_STYLES)[number];

export const STUDIO_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const STUDIO_MAX_DURATION_SECONDS = 60;
export const STUDIO_UPLOAD_EXTENSIONS = ["mp4", "mov"] as const;
/** Вертикальное видео: ширина/высота около 9:16 (0.5625) с допуском. */
export const STUDIO_ASPECT_MIN = 0.5;
export const STUDIO_ASPECT_MAX = 0.6;

export type StudioRenderOptions = {
  style: StudioStyle;
  backgroundUrl?: string;
  overlayText?: string;
  postId?: string;
};

export type StudioPostData = {
  id: string;
  title: string;
  style: StudioStyle;
  voiceoverText: string;
  visualPrompt: string;
};
