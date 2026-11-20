import { connection } from "next/server";

import { googleAuthUrl, ownedAgent } from "@/lib/google-calendar";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const back = new URL(`/agents/${id}`, request.url);
  try {
    const owned = await ownedAgent(id);
    if (!owned) {
      back.searchParams.set("calendar", "error");
      back.searchParams.set("message", "Агент не найден.");
      return Response.redirect(back);
    }
    return Response.redirect(googleAuthUrl(request, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось начать подключение.";
    if (message.includes("Нужно войти")) return Response.redirect(new URL("/login", request.url));
    back.searchParams.set("calendar", "error");
    back.searchParams.set("message", message);
    return Response.redirect(back);
  }
}
