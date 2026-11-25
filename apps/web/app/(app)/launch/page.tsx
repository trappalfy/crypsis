import type { Metadata } from "next";
import LaunchForm from "@/components/launch/LaunchForm";

export const metadata: Metadata = { title: "Launch", description: "Launch your coin on pump.fun from Crypsis. It's Ring-ready before the first holder shows up." };

export default function LaunchPage() {
  return <LaunchForm />;
}
