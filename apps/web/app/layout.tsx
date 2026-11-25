import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE } from "@/lib/site";
import "./globals.css";

const instrumentSerif = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff2", style: "normal", weight: "400" },
    { path: "./fonts/InstrumentSerif-Italic.woff2", style: "italic", weight: "400" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
  preload: true, // the LCP text (hero wordmark + headline) is set in Instrument Serif
});
// Geist / Geist Mono (OFL, from the `geist` package): not preloaded so they don't compete with the LCP font.
const geistSans = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist-sans", weight: "100 900", display: "swap", preload: false });
const geistMono = localFont({ src: "./fonts/GeistMono-Variable.woff2", variable: "--font-geist-mono", weight: "100 900", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: "%s — Crypsis" },
  description: SITE.description,
  openGraph: { title: SITE.title, description: SITE.description, url: SITE.url, siteName: "Crypsis", type: "website" },
  twitter: { card: "summary_large_image", site: "@crypsisfun", title: SITE.title, description: SITE.description },
};

export const viewport: Viewport = { themeColor: "#EC6C40", colorScheme: "light dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
