import { FAQ } from "@/lib/copy";
import styles from "./Faq.module.css";

// Brief §5 S8 / §8.3 — native <details> accordion (works without JS, keyboard accessible).
export default function Faq() {
  return (
    <section className={styles.section} aria-labelledby="faq-title">
      <h2 id="faq-title" className={styles.title}>FAQ</h2>
      <div className={styles.list}>
        {FAQ.map((f) => (
          <details key={f.q} className={styles.item}>
            <summary className={styles.q}>{f.q}<span aria-hidden="true" className={styles.plus}>+</span></summary>
            <p className={styles.a}>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
