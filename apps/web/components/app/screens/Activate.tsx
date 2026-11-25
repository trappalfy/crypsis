"use client";
import { callRing } from "@/lib/ring/client";
import type { BuiltTx } from "@/lib/ring/protocol";
import { useSession } from "@/lib/app/session";
import { APP_COPY } from "@/lib/copy";
import { shortAddress } from "@/lib/solana/wallet-standard";
import TxFlow from "../TxFlow";
import ui from "../ui.module.css";

export default function Activate() {
  const { view, sync } = useSession();
  if (!view) return null;
  return (
    <div className={ui.card} style={{ maxWidth: 640 }}>
      <h1 className={ui.pageTitle} style={{ fontSize: 56 }}>{APP_COPY.activateTitle}</h1>
      <p className={ui.note} style={{ margin: "14px 0 22px" }}>{APP_COPY.activateBody}</p>
      {view.registered ? (
        <div className={ui.notice} role="status">Receiving is active for {shortAddress(view.ringAddress)}.</div>
      ) : (
        <TxFlow
          cta="Activation"
          build={() => callRing<BuiltTx | null>("buildRegistration", {})}
          review={() => (
            <dl className={ui.kv}>
              <dt>Publishes</dt><dd>Your private address (encryption keys) in the Ring registry</dd>
              <dt>Owner</dt><dd>{view.ringAddress}</dd>
            </dl>
          )}
          publicNote="Activation is public: anyone can see that this address can receive Ring transfers."
          onDone={() => void sync()}
        />
      )}
    </div>
  );
}
