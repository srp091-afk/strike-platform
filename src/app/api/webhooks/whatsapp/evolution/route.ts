import { type NextRequest } from "next/server";

import { handleEvolutionWebhook } from "../route";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await handleEvolutionWebhook(body);
  } catch (error) {
    console.error("[evolution webhook]", error instanceof Error ? error.message : error);
  }
  return Response.json({ ok: true }, { status: 200 });
}
