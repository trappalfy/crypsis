import { ImageResponse } from "next/og";
import { AsciiArt, art, ogFonts } from "@/lib/og";
import { getCoinDetail } from "@/lib/tracker/data";
import { formatShare, shortMint } from "@/lib/tracker/types";

export const alt = "Share of supply in the Ring";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brief §6: orange background, ASCII butterfly sm, "X.XX% of supply in the Ring".
export default async function Image({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const [fonts, butterfly, d] = await Promise.all([ogFonts(), art("butterfly-sm-open.txt"), getCoinDetail(mint).catch(() => null)]);
  const share = d ? formatShare(d.coin.shareBps) : "—";
  const name = d?.coin.symbol ?? shortMint(mint);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#EC6C40", color: "#111010", padding: 64 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: "Instrument Serif", fontSize: 72, letterSpacing: -2 }}>Crypsis</div>
          <AsciiArt text={butterfly} size={15} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Geist Mono", fontSize: 26, letterSpacing: 1, textTransform: "uppercase" }}>{name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <span style={{ fontFamily: "Instrument Serif", fontSize: 190, lineHeight: 1, letterSpacing: -6 }}>{share}</span>
            <span style={{ fontFamily: "Instrument Serif", fontStyle: "italic", fontSize: 64 }}>of supply in the Ring</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
