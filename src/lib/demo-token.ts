/**
 * Подпись запросов к публичным демо-эндпоинтам. Общая часть для клиента и сервера.
 *
 * Токен = `<timestamp>.<sha256(timestamp:path:соль)>`. Соль попадает в клиентский бандл, поэтому это не
 * криптографическая защита, а барьер от «голых» запросов из Postman, curl и простых парсеров: чтобы его
 * обойти, нужно прочитать бандл и повторить схему. Живёт токен несколько минут и привязан к пути.
 */
export const DEMO_TOKEN_HEADER = "x-demo-token";
export const DEMO_TOKEN_TTL_MS = 3 * 60 * 1000;

/** Соль можно переопределить через NEXT_PUBLIC_DEMO_SIGN_SALT (на клиенте и сервере значение одно и то же). */
export const DEMO_SIGN_SALT = process.env.NEXT_PUBLIC_DEMO_SIGN_SALT || "strike-demo-sign-v1";

export function demoTokenPayload(timestamp: number, path: string) {
  return `${timestamp}:${path}:${DEMO_SIGN_SALT}`;
}
