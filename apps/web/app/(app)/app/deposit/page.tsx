import type { Metadata } from "next";
import { Suspense } from "react";
import Gate from "@/components/app/Gate";
import Screen from "@/components/app/screens/Deposit";

export const metadata: Metadata = { title: "Deposit", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Gate><Screen /></Gate>
    </Suspense>
  );
}
