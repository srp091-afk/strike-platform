import { connection } from "next/server";

import { listAdProjectCards } from "@/lib/ad-projects";
import { getAuthenticatedUserId } from "@/lib/auth-user";

export async function GET() {
  await connection();

  try {
    const userId = await getAuthenticatedUserId();
    const projects = await listAdProjectCards(userId);
    return Response.json(
      { projects },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить проекты." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
