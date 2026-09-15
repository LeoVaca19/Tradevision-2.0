/**
 * Sparkline SVG de P&L acumulada — sin librería de gráficos (Tech Spec §12).
 */
export function EquityCurve({ points, width = 640, height = 120 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) {
    return <p className="tv-empty">No hay suficientes operaciones para trazar la curva.</p>;
  }

  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const scaleY = (v: number) => height - ((v - min) / span) * height;
  const zeroY = scaleY(0);

  const linePoints = points.map((v, i) => `${i * stepX},${scaleY(v)}`).join(" ");
  const areaPoints = `0,${zeroY} ${linePoints} ${width},${zeroY}`;
  const last = points[points.length - 1] ?? 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="tv-curve"
      role="img"
      aria-label={`Curva de P&L acumulada, ${points.length} operaciones, valor final ${last.toFixed(2)}`}
    >
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} className="tv-curve-zero" />
      <polygon points={areaPoints} className="tv-curve-area" />
      <polyline points={linePoints} className="tv-curve-line" />
    </svg>
  );
}
