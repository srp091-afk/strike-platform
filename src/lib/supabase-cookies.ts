export function supabaseCookieOptions(secure: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}

export function isSecureRequest(request: { nextUrl: { protocol: string }; headers: Headers }) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  return request.nextUrl.protocol === "https:";
}
