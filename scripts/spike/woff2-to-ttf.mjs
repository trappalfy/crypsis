// One-off: decompress the kit's OFL woff2 fonts to TTF for next/og (satori can't read woff2).
// Needs the brief kit on disk (crypsis-brief/ is kept out of the repository); output is committed in apps/web/assets/fonts.
import { readFileSync, writeFileSync } from "node:fs";
import wawoff2 from "wawoff2";
const kit = new URL("../../crypsis-brief/kit/fonts/", import.meta.url);
const out = new URL("../../apps/web/assets/fonts/", import.meta.url);
for (const f of ["InstrumentSerif-Regular", "InstrumentSerif-Italic"]) {
  const ttf = await wawoff2.decompress(readFileSync(new URL(`${f}.woff2`, kit)));
  writeFileSync(new URL(`${f}.ttf`, out), ttf);
  console.log(f, ttf.length);
}
