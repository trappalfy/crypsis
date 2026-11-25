// <DotBars values/> — dot histogram (MediSense): every column is a stack of circles.
// values are 0..1 fractions of the column height. Pure SVG, server-renderable.
export default function DotBars({
  values, dots = 10, size = 6, gap = 3, color = "var(--orange)", empty = "rgba(255,255,255,.12)", label, className,
}: { values: number[]; dots?: number; size?: number; gap?: number; color?: string; empty?: string; label?: string; className?: string }) {
  const step = size + gap;
  const w = values.length * step - gap, h = dots * step - gap;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {values.map((v, x) => {
        const filled = v <= 0 ? 0 : Math.max(1, Math.round(Math.min(1, v) * dots));
        return Array.from({ length: dots }, (_, y) => (
          <circle key={`${x}-${y}`} cx={x * step + size / 2} cy={h - (y * step + size / 2)} r={size / 2} fill={y < filled ? color : empty} />
        ));
      })}
    </svg>
  );
}
