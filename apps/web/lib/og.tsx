import { readFileSync } from "node:fs";
import { join } from "node:path";

// Shared bits for next/og images (orange, ASCII butterfly, Instrument Serif + Geist Mono).
// sync reads: build-time assets, lets icons/OG prerender statically
const font = (f: string) => Promise.resolve(readFileSync(join(process.cwd(), "assets/fonts", f)));
export async function ogFonts() {
  const [serif, serifItalic, mono] = await Promise.all([font("InstrumentSerif-Regular.ttf"), font("InstrumentSerif-Italic.ttf"), font("GeistMono-Medium.ttf")]);
  return [
    { name: "Instrument Serif", data: serif, style: "normal" as const, weight: 400 as const },
    { name: "Instrument Serif", data: serifItalic, style: "italic" as const, weight: 400 as const },
    { name: "Geist Mono", data: mono, style: "normal" as const, weight: 500 as const },
  ];
}
export const art = (name: string) => Promise.resolve(readFileSync(join(process.cwd(), "lib/ascii/frames", name), "utf8"));

export function AsciiArt({ text, size, color = "#FFFFFF" }: { text: string; size: number; color?: string }) {
  const lines = text.replace(/\n+$/, "").split("\n");
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Geist Mono", fontSize: size, lineHeight: 1, color }}>
      {lines.map((l, i) => <div key={i} style={{ display: "flex", whiteSpace: "pre", height: size }}>{l || " "}</div>)}
    </div>
  );
}
