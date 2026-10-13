import { connection } from "next/server";

import { OWNERSHIP_CONFIRM, readOwnershipReport, reassignToSession } from "@/lib/ownership";

export async function GET() {
  await connection();
  try {
    const report = await readOwnershipReport();
    return Response.json({ applied: false, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ownership]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось прочитать владельцев." },
      { status: errorStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
    const confirm = typeof body?.confirm === "string" ? body.confirm : "";
    if (confirm !== OWNERSHIP_CONFIRM) {
      const report = await readOwnershipReport();
      return Response.json(
        {
          applied: false,
          error: `Чтобы перенести строки, повтори запрос с {"confirm":"${OWNERSHIP_CONFIRM}"}.`,
          report,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await reassignToSession(confirm);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ownership]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось перенести строки." },
      { status: errorStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}

function errorStatus(error: unknown) {
  return error instanceof Error && error.message.includes("войти") ? 401 : 500;
}
