export function HourChart({ buckets }: { buckets: { hour: Date; ok: number; failed: number }[] }) {
  const W = 640, H = 170, pl = 34, pb = 20;
  const max = Math.max(10, ...buckets.map((b) => b.ok + b.failed));
  const n = buckets.length || 1;
  const gw = (W - pl - 6) / n;
  const scale = (v: number) => (v / max) * (H - pb - 10);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Attempts per hour, last 24 hours">
      {ticks.map((t) => {
        const y = H - pb - scale(t);
        return (
          <g key={t}>
            <line x1={pl} x2={W - 4} y1={y} y2={y} stroke="#e4e6e2" />
            <text x={pl - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#858d95" fontFamily="var(--font-mono)">{t >= 1000 ? (t / 1000).toFixed(1) + "k" : t}</text>
          </g>
        );
      })}
      {buckets.map((b, i) => {
        const x = pl + i * gw + 2, w = Math.max(2, gw - 4);
        const hOk = scale(b.ok), hF = scale(b.failed);
        return (
          <g key={i}>
            <rect x={x} y={H - pb - hOk} width={w} height={hOk} fill="#0f1113" opacity={i === n - 1 ? 1 : 0.85} />
            <rect x={x} y={H - pb - hOk - hF} width={w} height={hF} fill="#d7263d" />
            {i % 4 === 0 && <text x={x + w / 2} y={H - 5} textAnchor="middle" fontSize="9" fill="#858d95" fontFamily="var(--font-mono)">{String(b.hour.getHours()).padStart(2, "0")}:00</text>}
          </g>
        );
      })}
    </svg>
  );
}
