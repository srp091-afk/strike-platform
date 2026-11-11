import { useSyncExternalStore } from "react";
import { preload, type SWRConfiguration } from "swr";

/** Общий кэш списков: повторный заход показывает прошлые данные, обновление идёт в фоне. */
export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 5_000,
  keepPreviousData: true,
};

/** Ключи, которые сайдбар прогревает при наведении, до клика по разделу. */
const NAV_DATA: Record<string, readonly string[]> = {
  "/agents": ["/api/agents"],
  "/outreach": ["/api/outreach"],
  "/chats": ["/api/agents?view=chat", "/api/chats?agentId=all"],
  "/ads": ["/api/ads"],
  "/funnels": ["/api/landings"],
};

/** Сервер и первый кадр клиента совпадают. Кэш SWR читаем только после этого, иначе скелетон вспыхивает при каждом переходе. */
export function useClientReady() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function preloadNavData(href: string) {
  for (const key of NAV_DATA[href] ?? []) void preload(key, jsonFetcher);
}

export async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" && payload.error.trim() ? payload.error : "Не удалось загрузить данные.");
  }
  return payload;
}
