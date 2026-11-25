import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--orange)", color: "var(--ink)", padding: 32 }}>
      <div>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(56px, 9vw, 140px)", lineHeight: 0.9, letterSpacing: "-0.03em" }}>Not <em>here.</em></h1>
        <p className="micro" style={{ marginTop: 20 }}>Hidden too well, or never existed.</p>
        <Link href="/" className="micro" style={{ display: "inline-block", marginTop: 24, padding: "9px 14px", border: "1px solid var(--ink)", borderRadius: 999, textDecoration: "none" }}>Back home →</Link>
      </div>
    </main>
  );
}
