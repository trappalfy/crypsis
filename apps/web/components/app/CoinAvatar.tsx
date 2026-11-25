import ui from "./ui.module.css";
export default function CoinAvatar({ symbol }: { symbol: string | null }) {
  return <span className={ui.avatar} aria-hidden="true">{(symbol ?? "?").slice(0, 3)}</span>;
}
