import type { Metadata } from "next";
import PageShell from "@/components/site/PageShell";

export const metadata: Metadata = { title: "Terms", robots: { index: false } };

// TODO(OWNER): legal text. Nothing here may promise anything until the owner provides it.
export default function Terms() {
  return (
    <PageShell kicker="Terms" title="Terms of use">
      <p className="notice" data-owner-todo="legal">The terms of use are being prepared and will be published here before launch.</p>
    </PageShell>
  );
}
