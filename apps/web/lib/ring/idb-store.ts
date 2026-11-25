// WalletStateStore over IndexedDB. Holds only the SDK-sealed (AES-256-GCM) snapshot string.
// One record per live wallet identity; each save is a single put (atomic: replaces or leaves unchanged).
import type { WalletStateStore } from "@heliuslabs/spr";

const DB = "crypsis-ring", STORE = "snapshots";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); res(req ? (req.result as T) : undefined); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
  }));
}
export function idbSnapshotStore(key: string): WalletStateStore {
  return {
    load: async () => { const v = await run<string>("readonly", (s) => s.get(key)); return v ? v : undefined; },
    save: async (snapshot) => { await run("readwrite", (s) => (snapshot ? s.put(snapshot, key) : s.delete(key))); },
  };
}
