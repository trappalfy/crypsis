import Cipher from "@/components/ascii/Cipher";
import { CHAIN_SEES } from "@/lib/copy";
import styles from "./ChainSees.module.css";

// Brief §5 S4 + §2.1: the honest privacy table. Hidden cells are <Cipher/>, public cells say "Public".
export function ChainTable({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`${styles.tableWrap} ${dark ? styles.dark : ""}`} tabIndex={0} role="region" aria-label={CHAIN_SEES.title}>
      <table className={styles.table}>
        <caption className="sr-only">{CHAIN_SEES.title}</caption>
        <thead>
          <tr>
            <th scope="col" className="micro">Event</th>
            {CHAIN_SEES.columns.map((c) => <th key={c} scope="col" className="micro">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {CHAIN_SEES.rows.map((row) => (
            <tr key={row.event}>
              <th scope="row">
                <span className={styles.event}>{row.event}</span>
                <span className={`micro ${styles.sub}`}>{row.sub}</span>
              </th>
              {row.cells.map((cell, i) => (
                <td key={i} className={cell === "hidden" ? styles.hidden : cell === "none" ? styles.none : styles.public}>
                  {cell === "hidden" ? <Cipher length={i === 1 ? 9 : 7} label="Hidden" /> : cell === "none" ? <span aria-label="Not applicable">—</span> : "Public"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`micro ${styles.foot}`}>{CHAIN_SEES.footnote}</p>
    </div>
  );
}

export default function ChainSees() {
  return (
    <section className={styles.section} aria-labelledby="chain-title">
      <h2 id="chain-title" className={styles.title}>What the chain <em>sees</em></h2>
      <ChainTable />
      <p className={styles.caption}>{CHAIN_SEES.caption}</p>
    </section>
  );
}
