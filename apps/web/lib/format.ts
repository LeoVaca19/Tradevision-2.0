import type { Metric, RadarAxis } from "@tradevision/contracts";

/**
 * Formato compartido de cifras/fechas/etiquetas para las páginas de registro.
 * Presentación pura — sin cálculo, sin I/O.
 */

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatSigned(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(n))}`;
}

export function signClass(n: number): string {
  if (n > 0) return "tv-num-pos";
  if (n < 0) return "tv-num-neg";
  return "";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const SIDE_LABEL: Record<string, string> = {
  long: "Largo",
  short: "Corto",
};

export const NOT_TAKEN_REASON_LABEL: Record<string, string> = {
  fear: "Miedo",
  doubt: "Duda",
  missed_in_time: "Llegó tarde",
  outside_session: "Fuera de sesión",
  risk_limit_reached: "Límite de riesgo alcanzado",
  other: "Otro",
};

export const METRIC_LABELS: Record<string, string> = {
  win_rate: "Win Rate",
  expectancy: "Expectancy (R)",
  r_multiple_avg: "R-múltiplo (payoff)",
  profit_factor: "Profit Factor",
  max_drawdown: "Drawdown máx. (R)",
  streaks: "Racha ganadora máx.",
  sharpe_ratio: "Ratio de Sharpe",
  z_score: "Z-Score de rachas",
};

export function metricLabel(metric: Metric | string): string {
  return METRIC_LABELS[metric] ?? metric;
}

export function formatMetricValue(kind: "value" | "insufficient_data", metric: Metric | string, value?: number): string {
  if (kind === "insufficient_data" || value == null) return "—";
  if (metric === "win_rate") return `${(value * 100).toFixed(1)}%`;
  if (metric === "streaks") return String(value);
  return value.toFixed(2);
}

export const RADAR_AXIS_LABELS: Record<string, string> = {
  win_rate: "Win Rate",
  profit_factor: "Profit Factor",
  avg_win_loss: "Payoff Ratio",
  consistency: "Consistencia",
  risk_management: "Gestión de riesgo",
  recovery: "Recovery Factor",
};

export function radarAxisLabel(axis: RadarAxis | string): string {
  return RADAR_AXIS_LABELS[axis] ?? axis;
}
