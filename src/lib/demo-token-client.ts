import { DEMO_TOKEN_HEADER, demoTokenPayload } from "@/lib/demo-token";

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Заголовок с одноразово сгенерированным токеном для конкретного пути, например "/api/demo/chat". */
export async function demoAuthHeaders(path: string): Promise<Record<string, string>> {
  const timestamp = Date.now();
  const signature = await sha256Hex(demoTokenPayload(timestamp, path));
  return { [DEMO_TOKEN_HEADER]: `${timestamp}.${signature}` };
}
