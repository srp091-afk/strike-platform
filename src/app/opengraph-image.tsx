import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt = "STRIKE — AI-агенты для продаж и поддержки";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const root = join(process.cwd(), "src/assets");
  const [latinBlack, cyrillicBlack, latinRegular, cyrillicRegular] = await Promise.all([
    readFile(join(root, "inter-latin-900.woff")),
    readFile(join(root, "inter-cyrillic-900.woff")),
    readFile(join(root, "inter-latin-400.woff")),
    readFile(join(root, "inter-cyrillic-400.woff")),
  ]);

  return new ImageResponse(
    (
      <div
        tw="flex h-full w-full flex-col items-center justify-center bg-black text-white"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          fontFamily: "Inter",
        }}
      >
        <div tw="flex text-[148px] font-black tracking-tight leading-none">
          STRIKE<span tw="text-rose-600">.</span>
        </div>
        <div tw="mt-8 flex text-[32px] font-normal text-zinc-400">AI-агенты для продаж и поддержки</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: latinBlack, weight: 900, style: "normal" },
        { name: "Inter", data: cyrillicBlack, weight: 900, style: "normal" },
        { name: "Inter", data: latinRegular, weight: 400, style: "normal" },
        { name: "Inter", data: cyrillicRegular, weight: 400, style: "normal" },
      ],
    },
  );
}
