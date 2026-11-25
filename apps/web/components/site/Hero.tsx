import { readFileSync } from "node:fs";
import { join } from "node:path";
import HeroCanvas from "@/components/ascii/HeroCanvas";
import Slot from "./Slot";
import { HERO } from "@/lib/copy";
import { SITE } from "@/lib/site";
import styles from "./Hero.module.css";

const openArt = () => readFileSync(join(process.cwd(), "lib/ascii/frames/butterfly-md-open.txt"), "utf8");

// Brief §5 S1 (DOT BY DOT): flat orange, wordmark top-left, mono micro-copy columns, live ASCII butterfly.
export default function Hero() {
  const cta = SITE.appLive ? { label: HERO.ctaLive, href: "/app" } : { label: HERO.ctaSoon, href: SITE.xUrl };
  return (
    <section className={styles.hero} aria-label="Crypsis">
      <HeroCanvas />
      <noscript>
        <pre className={styles.noscript} aria-hidden="true">{openArt()}</pre>
      </noscript>
      <p className="sr-only">{HERO.srDescription}</p>
      <div className={styles.ui}>
        <h1 className={styles.wordmark}>{HERO.wordmark}</h1>
        <p className={`micro ${styles.m1}`}>{HERO.micro[0][0]}<br />{HERO.micro[0][1]}</p>
        <p className={`micro ${styles.m2}`}><span className={styles.dim}>{HERO.micro[1][0]}</span><br />{HERO.micro[1][1]}</p>
        <p className={`micro ${styles.m3}`}><span className={styles.dim}>{HERO.micro[2][0]}</span><br /><Slot /></p>
        <div className={styles.bottom}>
          <p className={styles.headline}>{HERO.headline[0]}<br /><em>{HERO.headline[1]}</em></p>
          <nav className={`micro ${styles.tabs}`} aria-label="Sections">
            {HERO.tabs.map((t, i) => (
              <a key={t.href} href={t.href} className={i === 0 ? styles.on : undefined}>{t.label}</a>
            ))}
          </nav>
          <div className={`micro ${styles.note}`}>
            <p className={styles.dim}>{HERO.note[0]}<br />{HERO.note[1]}</p>
            <a className={styles.pill} href={cta.href} {...(SITE.appLive ? {} : { target: "_blank", rel: "noopener noreferrer" })}>{cta.label}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
