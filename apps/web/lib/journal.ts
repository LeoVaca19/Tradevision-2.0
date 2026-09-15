import {
  expectancyR,
  maxDrawdown,
  profitFactor,
  sortTrades,
  streaks,
  winRate,
  type ClosedTrade,
} from "@tradevision/engine";

/**
 * Helpers de PRESENTACIÓN para el Diario (pantalla `/trades`). Son cálculos
 * derivados sobre lo que ya devuelve `lib/data.ts` — no definen contrato nuevo.
 *
 * Todo lo que sale de aquí es Estadística DECLARADA (Libro Manual): el usuario la
 * teclea, no lleva Sello. Las cifras Verificadas necesitan la sincronización de
 * bróker + una función de fachada `listVerifiedTrades()` que hoy no existe.
 */

export interface JournalTrade {
  id: string;
  instrument: string;
  side: "long" | "short";
  openedAt: string;
  closedAt: string;
  pnlCurrency: number;
  pnlR: number | null;
}

const toClosed = (t: JournalTrade): ClosedTrade => ({
  id: t.id,
  closedAt: t.closedAt,
  pnlCurrency: t.pnlCurrency,
  pnlR: t.pnlR,
});

export interface JournalSummary {
  count: number;
  netCurrency: number;
  winRatePct: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number | null;
  bestWinStreak: number | null;
}

export function summarize(trades: readonly JournalTrade[]): JournalSummary {
  const closed = sortTrades(trades.map(toClosed));
  const wr = winRate(closed);
  return {
    count: trades.length,
    netCurrency: trades.reduce((a, t) => a + t.pnlCurrency, 0),
    winRatePct: wr == null ? null : wr * 100,
    expectancyR: expectancyR(closed),
    profitFactor: profitFactor(closed),
    maxDrawdownR: maxDrawdown(closed, "")?.maxDrawdownR ?? null,
    bestWinStreak: trades.length ? streaks(closed).longestWin : null,
  };
}

/** Curva de P&L acumulada en divisa, ordenada por cierre. Para el sparkline. */
export function cumulativeCurve(trades: readonly JournalTrade[]): { t: string; cum: number }[] {
  let cum = 0;
  return sortTrades(trades.map(toClosed)).map((t) => {
    cum += t.pnlCurrency;
    return { t: t.closedAt, cum };
  });
}

// ─────────────────────────────  Calendario  ─────────────────────────────

export interface DayCell {
  date: string; // YYYY-MM-DD
  inMonth: boolean;
  pnl: number;
  count: number;
}

const dayKey = (iso: string) => iso.slice(0, 10);

export function parseMonth(raw: string | undefined, fallback: Date): { year: number; month: number } {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) - 1 };
  return { year: fallback.getUTCFullYear(), month: fallback.getUTCMonth() };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("es", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Matriz de semanas (lunes-domingo) que cubre el mes dado. */
export function monthMatrix(
  year: number,
  month: number,
  trades: readonly JournalTrade[],
): DayCell[][] {
  const byDay = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    const k = dayKey(t.closedAt);
    const prev = byDay.get(k) ?? { pnl: 0, count: 0 };
    byDay.set(k, { pnl: prev.pnl + t.pnlCurrency, count: prev.count + 1 });
  }

  const first = new Date(Date.UTC(year, month, 1));
  const weekdayMon0 = (first.getUTCDay() + 6) % 7; // lunes = 0
  const start = new Date(first);
  start.setUTCDate(1 - weekdayMon0);

  const weeks: DayCell[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      const hit = byDay.get(iso);
      row.push({
        date: iso,
        inMonth: cursor.getUTCMonth() === month,
        pnl: hit?.pnl ?? 0,
        count: hit?.count ?? 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(row);
    if (cursor.getUTCMonth() !== month && w >= 3) break;
  }
  return weeks;
}
