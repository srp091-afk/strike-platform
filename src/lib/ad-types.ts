export type AdGenerationStatus = "processing" | "ready" | "error";

export interface AdGeneration {
  id: string;
  project_id: string;
  title: string;
  style_name: string;
  status: AdGenerationStatus;
  is_active: boolean;
  images: string[];
  created_at: string;
}
