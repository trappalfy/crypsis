import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/site/PageShell";

export const metadata: Metadata = { title: "Privacy", robots: { index: false } };

// TODO(OWNER): legal privacy policy. Until then, only facts about how the product works.
export default function Privacy() {
  return (
    <PageShell kicker="Privacy" title="Privacy policy">
      <p className="notice" data-owner-todo="legal">The privacy policy is being prepared and will be published here before launch.</p>
      <p style={{ marginTop: 24 }}>How the product handles keys and onchain data is described in the <Link href="/privacy-model">privacy model</Link>.</p>
    </PageShell>
  );
}
