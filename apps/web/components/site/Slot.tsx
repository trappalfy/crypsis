"use client";
import { useEffect, useState } from "react";

/** Live mainnet slot, refreshed every 2 s (paused while the tab is hidden). */
export default function Slot() {
  const [slot, setSlot] = useState<number | null>(null);
  useEffect(() => {
    let alive = true, timer = 0;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch("/api/slot");
          const j = (await r.json()) as { slot: number | null };
          if (alive && j.slot) setSlot(j.slot);
        } catch { /* keep last value */ }
      }
      if (alive) timer = window.setTimeout(tick, 2000);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return <span className="num">Slot {slot ? slot.toLocaleString("en-US") : "———"}</span>;
}
