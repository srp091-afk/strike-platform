export async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" && payload.error.trim() ? payload.error : "Не удалось загрузить данные.");
  }
  return payload;
}
