import AsciiRing from "@/components/ascii/AsciiRing";
import { MANIFESTO } from "@/lib/copy";
import styles from "./Manifesto.module.css";

// Brief §5 S2 (0xLayer): two giant lines cut by an ASCII object.
export default function Manifesto() {
  return (
    <section className={styles.manifesto} aria-labelledby="manifesto-title">
      <h2 id="manifesto-title" className={styles.lines}>
        <span className={styles.top}>{MANIFESTO.top}</span>
        <span className={styles.row}>
          <span className={styles.ring}><AsciiRing cols={64} rows={30} /></span>
          <span className={styles.bottom}>{MANIFESTO.bottom}</span>
        </span>
      </h2>
      <p className={styles.body}>{MANIFESTO.body}</p>
    </section>
  );
}
