export type SmmAssetType = "user_upload" | "ai_generated";

export type SmmAssetItem = {
  id: string;
  fileUrl: string;
  assetType: SmmAssetType;
  isVideo: boolean;
  createdAt: string;
};

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i;

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url);
}