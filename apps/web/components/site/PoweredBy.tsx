import { POWERED } from "@/lib/copy";
import styles from "./PoweredBy.module.css";

// Brief §5 S7. Logos only from official brand kits, unmodified. Until the owner supplies the files and
// confirms permission (pump.fun especially), the names are set as monochrome type. TODO(OWNER)
export default function PoweredBy() {
  return (
    <section className={styles.section} aria-labelledby="powered-title">
      <h2 id="powered-title" className={`micro ${styles.title}`}>{POWERED.title}</h2>
      <ul className={styles.logos}>
        {POWERED.items.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </section>
  );
}
