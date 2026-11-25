import { ImageResponse } from "next/og";
import { AsciiArt, art, ogFonts } from "@/lib/og";

export const alt = "Crypsis — Hidden in plain sight.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brief §7.5: orange, butterfly from butterfly-hero-open.txt, "Crypsis" left, "Hidden in plain sight." right.
export default async function Image() {
  const [fonts, butterfly] = await Promise.all([ogFonts(), art("butterfly-md-open.txt")]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#EC6C40", color: "#111010", position: "relative", padding: 56 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center" }}>
          <AsciiArt text={butterfly} size={11} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontFamily: "Instrument Serif", fontSize: 132, letterSpacing: -4, lineHeight: 0.85 }}>Crypsis</div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Instrument Serif", fontSize: 72, lineHeight: 0.92, letterSpacing: -1.5, textAlign: "right" }}>
              <span>Hidden in</span>
              <span style={{ fontStyle: "italic" }}>plain sight.</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
