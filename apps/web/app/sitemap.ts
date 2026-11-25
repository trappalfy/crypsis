import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/tracker", "/launch", "/privacy-model"].map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: p === "/tracker" ? "hourly" : "weekly" }));
}
