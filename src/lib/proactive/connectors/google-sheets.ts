import { entitiesFromRecords, parseCsv } from "@/lib/proactive/connectors/csv";
import type { DataSourceAdapter } from "@/lib/proactive/connectors/types";

export function sheetsExportUrl(link: string) {
  const id = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) return null;
  const gid = link.match(/[?#&]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
}

async function loadSheet(config: Record<string, unknown>) {
  const url = typeof config.url === "string" ? sheetsExportUrl(config.url.trim()) : null;
  if (!url) return { ok: false as const, error: "Нужна ссылка на Google Таблицу." };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
    if (!response.ok) return { ok: false as const, error: "Таблица не открылась. Откройте доступ по ссылке." };
    const text = await response.text();
    if (/<!doctype html/i.test(text.slice(0, 200))) {
      return { ok: false as const, error: "Таблица закрыта. Включите доступ «все, у кого есть ссылка»." };
    }
    return { ok: true as const, text };
  } catch {
    return { ok: false as const, error: "Google Таблица не ответила." };
  }
}

export const googleSheetsAdapter: DataSourceAdapter = {
  async testConnection(config) {
    const loaded = await loadSheet(config);
    if (!loaded.ok) return loaded;
    const rows = entitiesFromRecords(parseCsv(loaded.text).records);
    if (rows.length === 0) return { ok: false, error: "В таблице нет строк." };
    return { ok: true, detail: `Строк: ${rows.length}` };
  },
  async fetchEntities(config) {
    const loaded = await loadSheet(config);
    if (!loaded.ok) throw new Error(loaded.error);
    return entitiesFromRecords(parseCsv(loaded.text).records);
  },
  async executePostAction() {},
};
