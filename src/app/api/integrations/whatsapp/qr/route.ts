import { getGreenQr } from "@/lib/green-api";

export async function GET() {
  try {
    const qr = await getGreenQr();
    if (qr.type === "qrCode" && qr.message.startsWith("data:image/")) {
      return Response.json({ type: "qrCode", image: qr.message }, { headers: { "Cache-Control": "no-store" } });
    }
    if (qr.type === "alreadyLogged") {
      return Response.json({ type: "alreadyLogged" }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(
      { type: "error", message: "Не удалось получить QR-код." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[whatsapp qr]", error instanceof Error ? error.message : error);
    return Response.json(
      { type: "error", message: "Green API сейчас недоступен." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
