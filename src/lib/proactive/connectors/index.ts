import type { DataSourceAdapter } from "@/lib/proactive/connectors/types";
import { csvAdapter } from "@/lib/proactive/connectors/csv";
import { googleSheetsAdapter } from "@/lib/proactive/connectors/google-sheets";
import { pipedriveAdapter } from "@/lib/proactive/connectors/pipedrive";

export type SourceType = "csv" | "google_sheets" | "pipedrive";

const ADAPTERS: Record<SourceType, DataSourceAdapter> = {
  csv: csvAdapter,
  google_sheets: googleSheetsAdapter,
  pipedrive: pipedriveAdapter,
};

export function sourceAdapter(type: string): DataSourceAdapter | null {
  return type === "csv" || type === "google_sheets" || type === "pipedrive" ? ADAPTERS[type] : null;
}
