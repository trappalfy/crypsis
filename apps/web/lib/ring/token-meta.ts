// Browser-safe (Uint8Array) mint + metadata decoders. Mirrors lib/indexer/accounts.ts.
const dv = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);
const clean = (s: string) => s.replace(/\0+$/g, "").trim() || null;
const dec = new TextDecoder();

export function decodeMintInfo(data: Uint8Array): { decimals: number; symbol: string | null; name: string | null } {
  const decimals = data[44];
  // Token-2022 TokenMetadata extension (type 19)
  if (data.length > 166 && data[165] === 1) {
    const v = dv(data);
    let o = 166;
    while (o + 4 <= data.length) {
      const type = v.getUint16(o, true), len = v.getUint16(o + 2, true);
      if (type === 19) {
        let p = o + 4 + 64;
        const str = () => { const n = v.getUint32(p, true); const s = dec.decode(data.subarray(p + 4, p + 4 + n)); p += 4 + n; return s; };
        const name = str(), symbol = str();
        return { decimals, name: clean(name), symbol: clean(symbol) };
      }
      if (type === 0) break;
      o += 4 + len;
    }
  }
  return { decimals, symbol: null, name: null };
}

export function decodeMetaplex(data: Uint8Array): { symbol: string | null; name: string | null } {
  if (data.length < 70 || data[0] !== 4) return { symbol: null, name: null };
  const v = dv(data);
  let p = 65;
  const str = () => { const n = v.getUint32(p, true); const s = dec.decode(data.subarray(p + 4, p + 4 + n)); p += 4 + n; return s; };
  try { const name = str(), symbol = str(); return { name: clean(name), symbol: clean(symbol) }; } catch { return { symbol: null, name: null }; }
}
