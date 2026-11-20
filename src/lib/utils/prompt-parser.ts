const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const DEFAULTS: Record<string, string> = {
  client_name: "Клиент",
};

export const PROMPT_VARIABLES = [
  { token: "{{client_name}}", label: "Имя клиента" },
  { token: "{{client_phone}}", label: "Телефон" },
] as const;

/** Подставляет {{variable}} из контекста канала. Пустое имя клиента становится «Клиент», неизвестные теги остаются в тексте. */
export function interpolatePrompt(text: string, context: Record<string, string>) {
  return text.replace(TOKEN, (match, rawName: string) => {
    const name = rawName.trim();
    const value = context[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    return DEFAULTS[name] ?? match;
  });
}

/** Номер из chat id WhatsApp (`7900…@c.us`) или голой строки. Групповые id длиннее телефона не считаем номером. */
export function phoneFromHandle(value: string | null | undefined) {
  const head = (value ?? "").split("@")[0] ?? "";
  const digits = head.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return `+${digits}`;
}

export function nameFromRecord(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  for (const key of ["client_name", "name", "Name", "first_name", "firstName"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  }
  return "";
}
