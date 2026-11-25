"use client";
// App session (brief §4, §6.1): wallet connection, mode A/B, unlock with a determinism check,
// Lock / auto-lock, background sync, sign-and-submit. Secrets never touch React state or the server:
// derivation signatures go straight into the Ring worker (transferred buffers) and are wiped here.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { address, getAddressEncoder } from "@solana/kit";
import {
  WalletCapabilityError, capabilities, chainFor, connect as wsConnect, disconnect as wsDisconnect, onWalletChange,
  signExactMessage, signTransactionBytes, walletRefusedEnvelope, watchWallets,
} from "@/lib/solana/wallet-standard";
import { derivationMessage, vaultMessage } from "@/lib/ring/derivation";
import { callRing, lockRing, lockRingNow } from "@/lib/ring/client";
import { ringEndpoints } from "@/lib/ring/endpoints";
import type { BuiltTx, RingMode, SubmitResult, WalletView } from "@/lib/ring/protocol";
import { SITE } from "@/lib/site";

export const AUTO_LOCK_MS = 15 * 60 * 1000; // TODO(OWNER): may change (brief §4)

export type Status = "disconnected" | "connecting" | "locked" | "unlocking" | "unlocked";
export interface UnlockStep { step: "sign" | "confirm" | "derive" | "sync" }

interface Ctx {
  wallets: readonly Wallet[];
  wallet: Wallet | null;
  account: WalletAccount | null;
  status: Status;
  mode: RingMode;
  canModeA: boolean;
  view: WalletView | null;
  unlockStep: UnlockStep["step"] | null;
  syncing: boolean;
  error: unknown;
  connect: (w: Wallet, silent?: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  setMode: (m: RingMode) => void;
  unlock: (opts?: { resetDamaged?: boolean }) => Promise<void>;
  lock: () => void;
  sync: () => Promise<void>;
  signAndSubmit: (tx: BuiltTx, opts?: { sync?: boolean }) => Promise<SubmitResult>;
  clearError: () => void;
}
const SessionCtx = createContext<Ctx | null>(null);
export const useSession = () => {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
};

const LAST_WALLET = "crypsis:wallet";
// hashed: the device doesn't keep wallet addresses in clear
async function detKey(mode: RingMode, addr: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SITE.network}:${mode}:${addr}`)));
  return `crypsis:det:${Array.from(d.subarray(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
const modeKey = (name: string) => `crypsis:mode:${name}`;
/** Set once a wallet refuses the Ring SDK's off-chain envelope (Phantom): Mode A is impossible for it. */
const refusedKey = (name: string) => `crypsis:modeA-refused:${name}`;
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.reduce((d, x, i) => d | (x ^ b[i]), 0) === 0;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [mode, setModeState] = useState<RingMode>("A");
  const [modeARefused, setModeARefused] = useState(false);
  const [view, setView] = useState<WalletView | null>(null);
  const [unlockStep, setUnlockStep] = useState<UnlockStep["step"] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const lockTimer = useRef(0);
  const gen = useRef(0); // bumps on every lock/unlock: a late unlock result for an old generation is discarded

  useEffect(() => watchWallets(setWallets), []);
  const canModeA = wallet ? capabilities(wallet).directMode && !modeARefused : false;

  const lock = useCallback(() => {
    gen.current++;
    void lockRing(); // worker zeroes its keys, then is terminated: UTXOs and decrypted state go with it
    setView(null);
    setUnlockStep(null);
    setStatus((s) => (s === "disconnected" ? s : "locked"));
  }, []);

  const connect = useCallback(async (w: Wallet, silent = false) => {
    setError(null);
    setStatus("connecting");
    try {
      const acc = await wsConnect(w, silent);
      setWallet(w);
      setAccount(acc);
      const refused = localStorage.getItem(refusedKey(w.name)) === "1";
      const pref = localStorage.getItem(modeKey(w.name)) as RingMode | null;
      setModeARefused(refused);
      setModeState(refused || !capabilities(w).directMode ? "B" : (pref ?? "A"));
      localStorage.setItem(LAST_WALLET, w.name);
      setStatus("locked");
    } catch (e) {
      if (!silent) setError(e);
      setStatus("disconnected");
    }
  }, []);

  // reconnect the last wallet silently after a reload (keys still need a fresh unlock signature)
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || status !== "disconnected") return;
    const last = localStorage.getItem(LAST_WALLET);
    const w = last ? wallets.find((x) => x.name === last) : undefined;
    if (!w) return;
    tried.current = true;
    const t = setTimeout(() => void connect(w, true), 0); // outside the effect body: no sync setState
    return () => clearTimeout(t);
  }, [wallets, status, connect]);

  const disconnect = useCallback(async () => {
    lock();
    if (wallet) await wsDisconnect(wallet).catch(() => {});
    localStorage.removeItem(LAST_WALLET);
    setWallet(null);
    setAccount(null);
    setStatus("disconnected");
  }, [wallet, lock]);

  // account switched in the wallet -> lock (keys belong to the previous account)
  useEffect(() => {
    if (!wallet) return;
    return onWalletChange(wallet, () => {
      const acc = wallet.accounts[0];
      if (!acc) { lock(); setAccount(null); setStatus("disconnected"); return; }
      if (acc.address !== account?.address) { lock(); setAccount(acc); }
    });
  }, [wallet, account, lock]);

  const setMode = useCallback((m: RingMode) => {
    lock();
    setModeState(m);
    if (wallet) localStorage.setItem(modeKey(wallet.name), m);
  }, [wallet, lock]);

  const sync = useCallback(async () => {
    if (status !== "unlocked") return;
    setSyncing(true);
    try { setView(await callRing<WalletView>("sync", {})); setError(null); }
    catch (e) { setError(e); }
    finally { setSyncing(false); }
  }, [status]);

  const unlock = useCallback(async (first: { resetDamaged?: boolean } = {}): Promise<void> => {
    if (!wallet || !account) return;
    const attempt = async (opts: { resetDamaged?: boolean }, m: RingMode): Promise<void> => {
    const my = ++gen.current;
    const stale = () => my !== gen.current;
    setError(null);
    setStatus("unlocking");
    let a: Uint8Array | null = null, b: Uint8Array | null = null;
    try {
      const pub = getAddressEncoder().encode(address(account.address)) as Uint8Array;
      const msg = m === "A" ? await derivationMessage(pub) : vaultMessage();
      const dk = await detKey(m, account.address);
      setUnlockStep("sign");
      try {
        a = await signExactMessage(wallet, account, msg);
      } catch (e) {
        // the wallet can't sign the Ring SDK envelope (Phantom): remember that and continue with a Crypsis vault
        if (m === "A" && walletRefusedEnvelope(e)) {
          localStorage.setItem(refusedKey(wallet.name), "1");
          localStorage.setItem(modeKey(wallet.name), "B");
          setModeARefused(true);
          setModeState("B");
          return await attempt(opts, "B");
        }
        throw e;
      }
      // first unlock of this wallet in this mode (or a re-check): sign twice and compare (brief §4)
      if (opts.resetDamaged || localStorage.getItem(dk) !== "ok") {
        setUnlockStep("confirm");
        b = await signExactMessage(wallet, account, msg);
        if (!equal(a, b)) { localStorage.removeItem(dk); throw new WalletCapabilityError("NONDETERMINISTIC", "This wallet can't derive stable private keys."); }
        localStorage.setItem(dk, "ok");
      }
      if (stale()) return;
      setUnlockStep("derive");
      const seed = a.slice().buffer; // fresh buffer, transferred (detached) into the worker
      a.fill(0);
      try {
        await callRing("unlock", { endpoints: ringEndpoints(), mode: m, walletAddress: account.address, seed, ...(opts.resetDamaged ? { resetDamaged: true } : {}) }, [seed]);
      } catch (e) {
        // local snapshot unreadable and keys not provable on-chain: re-run the double-signature check, then reset
        if ((e as { code?: string }).code === "SNAPSHOT_UNVERIFIED" && !opts.resetDamaged) {
          localStorage.removeItem(dk);
          a?.fill(0); b?.fill(0);
          return await attempt({ resetDamaged: true }, m);
        }
        throw e;
      }
      if (stale()) { void lockRing(); return; }
      setUnlockStep("sync");
      setStatus("unlocked");
      try {
        const v = await callRing<WalletView>("sync", {});
        if (!stale()) setView(v);
      } catch (e) {
        // keys are fine, the network isn't: show the last local state and the error
        if (stale()) return;
        setError(e);
        setView(await callRing<WalletView>("view", {}).catch(() => null));
      }
      setUnlockStep(null);
    } catch (e) {
      if (stale()) return;
      setError(e);
      setUnlockStep(null);
      // a failed sync after a successful unlock keeps the session (keys are fine, the network isn't)
      setStatus((st) => (st === "unlocked" ? "unlocked" : "locked"));
    } finally {
      a?.fill(0);
      b?.fill(0);
    }
    };
    return attempt(first, mode);
  }, [wallet, account, mode]);

  const signAndSubmit = useCallback(async (tx: BuiltTx, opts: { sync?: boolean } = {}) => {
    if (!wallet || !account) throw new Error("No wallet");
    let signedBytes: Uint8Array | undefined;
    if (tx.signer === "wallet") {
      if (tx.version === 1 && !capabilities(wallet).signsV1) throw new WalletCapabilityError("NO_V1", "Your wallet can't sign Ring transactions yet.");
      signedBytes = await signTransactionBytes(wallet, account, tx.bytes, chainFor(SITE.network));
    }
    const r = await callRing<SubmitResult>("submit", { txId: tx.id, signedBytes, sync: opts.sync ?? true });
    if (r.view) setView(r.view);
    return r;
  }, [wallet, account]);

  // auto-lock after inactivity; background sync on focus and every 60 s
  useEffect(() => {
    if (status !== "unlocked") return;
    const reset = () => { clearTimeout(lockTimer.current); lockTimer.current = window.setTimeout(lock, AUTO_LOCK_MS); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => addEventListener(e, reset, { passive: true }));
    reset();
    const onFocus = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onFocus);
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void sync(); }, 60_000);
    return () => {
      events.forEach((e) => removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onFocus);
      clearTimeout(lockTimer.current);
      clearInterval(iv);
    };
  }, [status, lock, sync]);

  // closing the tab (or entering the back/forward cache) locks: keys zeroed, decrypted view dropped
  useEffect(() => {
    const onHide = () => {
      gen.current++;
      lockRingNow();
      setView(null);
      setUnlockStep(null);
      setStatus((st) => (st === "disconnected" ? st : "locked"));
    };
    addEventListener("pagehide", onHide);
    return () => removeEventListener("pagehide", onHide);
  }, []);

  const value = useMemo<Ctx>(() => ({
    wallets, wallet, account, status, mode, canModeA, view, unlockStep, syncing, error,
    connect, disconnect, setMode, unlock, lock, sync, signAndSubmit, clearError: () => setError(null),
  }), [wallets, wallet, account, status, mode, canModeA, view, unlockStep, syncing, error, connect, disconnect, setMode, unlock, lock, sync, signAndSubmit]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
