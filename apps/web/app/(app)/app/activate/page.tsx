import type { Metadata } from "next";
import { Suspense } from "react";
import Gate from "@/components/app/Gate";
import Screen from "@/components/app/screens/Activate";

export const metadata: Metadata = { title: "Activate receiving", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Gate banner={false}><Screen /></Gate>
    </Suspense>
  );
}
