import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { FOOTER } from "@/lib/copy";
import { SITE } from "@/lib/site";
import WordmarkCanvas from "./WordmarkCanvas";
import styles from "./Footer.module.css";

const wordmark = () => readFileSync(join(process.cwd(), "lib/ascii/frames/wordmark-crypsis.txt"), "utf8").replace(/\n+$/, "");

// Brief §5 S9: giant ASCII wordmark (160×37), white on orange, full width.
export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.markWrap}>
        <WordmarkCanvas text={wordmark()} />
        <noscript><pre className={styles.mark} aria-hidden="true">{wordmark()}</pre></noscript>
        <span className="sr-only">Crypsis</span>
      </div>
      <nav className={`micro ${styles.links}`} aria-label="Footer">
        {FOOTER.links.map((l) =>
          l.href === "x" ? (
            <a key={l.label} href={SITE.xUrl} target="_blank" rel="noopener noreferrer">{l.label}</a>
          ) : l.href === "/app" ? (
            <a key={l.label} href={l.href}>{l.label}</a>
          ) : (
            <Link key={l.label} href={l.href}>{l.label}</Link>
          ),
        )}
        <span className={styles.copy}>{FOOTER.copyright}</span>
      </nav>
    </footer>
  );
}
