import Link from "next/link";
import Footer from "./Footer";
import styles from "./PageShell.module.css";

export default function PageShell({ kicker, title, children }: { kicker: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <Link href="/" className={styles.mark}>Crypsis</Link>
        <nav className={`micro ${styles.nav}`} aria-label="Site">
          <Link href="/tracker">Tracker</Link>
          <Link href="/privacy-model">Privacy model</Link>
          <a href="/app">App</a>
        </nav>
      </header>
      <main className={styles.main}>
        <p className={`micro ${styles.kicker}`}>{kicker}</p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.body}>{children}</div>
      </main>
      <Footer />
    </>
  );
}
