import type { DataSourceAdapter } from "@/lib/proactive/connectors/types";
import { amoCrmAdapter } from "@/lib/proactive/connectors/amocrm";
import { csvAdapter } from "@/lib/proactive/connectors/csv";
import { googleSheetsAdapter } from "@/lib/proactive/connectors/google-sheets";
import { pipedriveAdapter } from "@/lib/proactive/connectors/pipedrive";
import { strikeChatsAdapter } from "@/lib/proactive/connectors/strike-chats";

export type SourceType = "csv" | "google_sheets" | "pipedrive" | "strike_chats" | "amocrm";

const ADAPTERS: Record<SourceType, DataSourceAdapter> = {
  csv: csvAdapter,
  google_sheets: googleSheetsAdapter,
  pipedrive: pipedriveAdapter,
  strike_chats: strikeChatsAdapter,
  amocrm: amoCrmAdapter,
};

export function sourceAdapter(type: string): DataSourceAdapter | null {
  return type in ADAPTERS ? ADAPTERS[type as SourceType] : null;
}
