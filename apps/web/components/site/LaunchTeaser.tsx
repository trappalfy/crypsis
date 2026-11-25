import HatchCanvas from "./HatchCanvas";
import { LAUNCH_TEASER } from "@/lib/copy";
import { SITE } from "@/lib/site";
import styles from "./LaunchTeaser.module.css";

export default function LaunchTeaser() {
  return (
    <section id="launch" className={styles.section} aria-labelledby="launch-title">
      <div className={styles.art}><HatchCanvas /></div>
      <div className={styles.copy}>
        <h2 id="launch-title" className={styles.title}>Every coin starts as a <em>chrysalis.</em></h2>
        <p className={styles.body}>{LAUNCH_TEASER.body}</p>
        {SITE.appLive ? (
          <a className={styles.cta} href="/launch">{LAUNCH_TEASER.ctaLive} →</a>
        ) : (
          <a className={styles.cta} href={SITE.xUrl} target="_blank" rel="noopener noreferrer">{LAUNCH_TEASER.ctaSoon} →</a>
        )}
      </div>
    </section>
  );
}
