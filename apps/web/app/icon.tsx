import { ImageResponse } from "next/og";
import { AsciiArt, art, ogFonts } from "@/lib/og";

// Brief §7.5: ASCII butterfly (butterfly-sm-open) in white on --orange. TODO(OWNER): or the X avatar file.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const [fonts, b] = await Promise.all([ogFonts(), art("butterfly-sm-open.txt")]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#EC6C40" }}>
        <AsciiArt text={b} size={17} />
      </div>
    ),
    { ...size, fonts },
  );
}
