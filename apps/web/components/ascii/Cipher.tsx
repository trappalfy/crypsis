"use client";
// <Cipher length animate/> — encrypted placeholder made of CIPHER_GLYPHS. Hover shimmers harder.
import { useEffect, useRef, useState } from "react";
import { CIPHER_GLYPHS } from "@/lib/ascii/engine";
import styles from "./Cipher.module.css";

const rand = (n: number) => Array.from({ length: n }, () => CIPHER_GLYPHS[(Math.random() * CIPHER_GLYPHS.length) | 0]).join("");
const seeded = (n: number, seed: number) => Array.from({ length: n }, (_, i) => CIPHER_GLYPHS[(seed * 7 + i * 13) % CIPHER_GLYPHS.length]).join("");

export default function Cipher({ length = 8, animate = true, label = "hidden", className }: { length?: number; animate?: boolean; label?: string; className?: string }) {
  const [text, setText] = useState(() => seeded(length, length));
  const hover = useRef(false);
  useEffect(() => {
    if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    const tick = () => {
      setText((prev) => {
        // a few cells per tick; on hover most of them
        const share = hover.current ? 0.8 : 0.25;
        return prev.split("").map((ch) => (Math.random() < share ? rand(1) : ch)).join("");
      });
      id = window.setTimeout(tick, hover.current ? 60 : 140);
    };
    id = window.setTimeout(tick, 140);
    return () => clearTimeout(id);
  }, [animate]);
  return (
    <span className={`${styles.cipher} ${className ?? ""}`} onMouseEnter={() => (hover.current = true)} onMouseLeave={() => (hover.current = false)}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
