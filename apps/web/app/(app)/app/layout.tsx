import { connection } from "next/server";

// Rendered per request so proxy.ts can apply the CSP nonce to every script (keys live on these pages).
export const instant = false;

export default async function PrivateAppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
