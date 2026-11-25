import type { Metadata } from "next";
import { Suspense } from "react";
import Gate from "@/components/app/Gate";
import Screen from "@/components/app/screens/Withdraw";

export const metadata: Metadata = { title: "Withdraw", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Gate><Screen /></Gate>
    </Suspense>
  );
}
