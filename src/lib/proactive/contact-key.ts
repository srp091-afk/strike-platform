/** Телефон — только цифры, email — в нижнем регистре. Так один человек склеивается между чатом и CRM. */
export function contactKey(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase().slice(0, 200);
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(0, 20);
  return raw.toLowerCase().replace(/^@/, "").slice(0, 200);
}

export function contactKeyFromChat(handle: string, externalId: string) {
  return contactKey(handle) || contactKey(externalId) || "";
}
