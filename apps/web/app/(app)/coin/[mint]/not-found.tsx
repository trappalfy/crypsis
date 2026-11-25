import Link from "next/link";
import MakeRingReady from "@/components/tracker/MakeRingReady";
import ui from "@/components/app/ui.module.css";

export default function CoinNotFound() {
  return (
    <div style={{ padding: "80px 0" }}>
      <h1 className={ui.pageTitle}>Not in <em>the Ring</em></h1>
      <p className={ui.note} style={{ marginTop: 18, maxWidth: "52ch" }}>This coin isn&apos;t Ring-ready yet, or it isn&apos;t a pump.fun coin. Only coins with a Ring vault show up in the tracker.</p>
      <MakeRingReady />
      <Link href="/tracker" className={`${ui.btn} ${ui.btnGhost}`} style={{ marginTop: 28 }}>Open tracker</Link>
    </div>
  );
}
