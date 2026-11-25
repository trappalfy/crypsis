import { Suspense } from "react";
import Hero from "@/components/site/Hero";
import Manifesto from "@/components/site/Manifesto";
import HowItWorks from "@/components/site/HowItWorks";
import ChainSees from "@/components/site/ChainSees";
import TrackerPreview from "@/components/site/TrackerPreview";
import LaunchTeaser from "@/components/site/LaunchTeaser";
import PoweredBy from "@/components/site/PoweredBy";
import Faq from "@/components/site/Faq";
import Footer from "@/components/site/Footer";

export default function Landing() {
  return (
    <>
      <main>
        <Hero />
        <Manifesto />
        <HowItWorks />
        <ChainSees />
        <Suspense fallback={null}>
          <TrackerPreview />
        </Suspense>
        <LaunchTeaser />
        <PoweredBy />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
