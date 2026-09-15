export interface RadarAxisPoint {
  key: string;
  label: string;
  /** 0–100, o `null` si el eje es `insufficient_data`. */
  value: number | null;
}

/**
 * Radar Score: seis ejes que se leen juntos, no ocho tarjetas idénticas. SVG
 * plano, sin librería, en tono `--state-declared`: el compuesto nunca lleva
 * Sello, así que el color recuerda esa regla en vez de ser decorativo.
 */
export function RadarChart({ axes, size = 300 }: { axes: RadarAxisPoint[]; size?: number }) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2 - 4;
  const maxR = size * 0.28;
  const labelR = maxR + 40;

  const angleFor = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pointAt = (i: number, frac: number): [number, number] => {
    const a = angleFor(i);
    return [cx + Math.cos(a) * maxR * frac, cy + Math.sin(a) * maxR * frac];
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPoints = (frac: number) => axes.map((_, i) => pointAt(i, frac).join(",")).join(" ");

  const valuePoints = axes
    .map((a, i) => pointAt(i, Math.max(0, Math.min(100, a.value ?? 0)) / 100).join(","))
    .join(" ");

  if (n === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="tv-radar"
      role="img"
      aria-label={`Radar de ${n} ejes: ${axes.map((a) => `${a.label} ${a.value ?? "sin dato"}`).join(", ")}`}
    >
      {rings.map((f) => (
        <polygon key={f} points={ringPoints(f)} className="tv-radar-ring" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pointAt(i, 1);
        return <line key={a.key} x1={cx} y1={cy} x2={x} y2={y} className="tv-radar-spoke" />;
      })}
      <polygon points={valuePoints} className="tv-radar-shape" />
      {axes.map((a, i) => {
        const frac = Math.max(0, Math.min(100, a.value ?? 0)) / 100;
        const [x, y] = pointAt(i, frac);
        return (
          <circle
            key={a.key}
            cx={x}
            cy={y}
            r={a.value == null ? 2.5 : 3.5}
            className={a.value == null ? "tv-radar-dot-insufficient" : "tv-radar-dot"}
          />
        );
      })}
      {axes.map((a, i) => {
        const angle = angleFor(i);
        const x = cx + Math.cos(angle) * labelR;
        const y = cy + Math.sin(angle) * labelR;
        return (
          <text key={a.key} x={x} y={y} className="tv-radar-label" textAnchor="middle" dominantBaseline="middle">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
