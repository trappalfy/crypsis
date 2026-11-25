import type { Metadata } from "next";
import { Suspense } from "react";
import Gate from "@/components/app/Gate";
import Balance from "@/components/app/screens/Balance";

export const metadata: Metadata = { title: "App", description: "Your private balance on Solana, built on Helius Privacy Rings.", robots: { index: false } };

export default function AppHome() {
  return (
    <Suspense fallback={null}>
      <Gate><Balance /></Gate>
    </Suspense>
  );
}
