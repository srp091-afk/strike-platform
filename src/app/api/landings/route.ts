import { connection } from "next/server";

import { listLandingsPreview } from "@/lib/landings";

export async function GET() {
  await connection();

  try {
    const landings = await listLandingsPreview();
    return Response.json(
      { landings },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить воронки." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
