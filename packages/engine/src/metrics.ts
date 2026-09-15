import type { TradeCore } from "@tradevision/contracts";
import type { DrawdownDetail, StreaksDetail } from "@tradevision/contracts";

/**
 * Funciones de métrica PURAS. Entrada: lista de operaciones ya ordenada de forma
 * determinista (ver `sortTrades`). Sin I/O, sin `Date.now()`, sin aleatoriedad.
 * Todas devuelven `null` cuando la métrica no está definida para la entrada; el
 * gating de muestra (MIN_SAMPLE_SIZE) se aplica en la capa `compute`, no aquí.
 */

export type ClosedTrade = Pick<
  TradeCore,
  "id" | "closedAt" | "pnlCurrency" | "pnlR"
>;

/** Orden canónico: por cierre ascendente, desempate por id. Estable y reproducible. */
export function sortTrades<T extends { closedAt: string; id: string }>(trades: readonly T[]): T[] {
  return [...trades].sort((a, b) =>
    a.closedAt === b.closedAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.closedAt < b.closedAt ? -1 : 1,
  );
}

const EPS = 1e-9;

function outcomeOf(t: ClosedTrade): "win" | "loss" | "breakeven" {
  if (t.pnlCurrency > EPS) return "win";
  if (t.pnlCurrency < -EPS) return "loss";
  return "breakeven";
}

/**
 * Win Rate = ganadoras / (ganadoras + perdedoras). Las de breakeven se excluyen
 * del denominador (criterio estándar prop firm). Rango [0, 1].
 */
export function winRate(trades: readonly ClosedTrade[]): number | null {
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    const o = outcomeOf(t);
    if (o === "win") wins++;
    else if (o === "loss") losses++;
  }
  const decisive = wins + losses;
  return decisive === 0 ? null : wins / decisive;
}

/** Expectancy = media del resultado por operación, en R. Sólo operaciones con `pnlR` conocido. */
export function expectancyR(trades: readonly ClosedTrade[]): number | null {
  const rs = trades.map((t) => t.pnlR).filter((r): r is number => r != null);
  if (rs.length === 0) return null;
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

/**
 * R-múltiplo (payoff ratio) = |R medio de ganadoras| / |R medio de perdedoras|.
 * Mide la asimetría ganador vs perdedor. `null` si falta alguno de los dos lados.
 */
export function rMultipleAvg(trades: readonly ClosedTrade[]): number | null {
  const winR: number[] = [];
  const lossR: number[] = [];
  for (const t of trades) {
    if (t.pnlR == null) continue;
    if (t.pnlR > EPS) winR.push(t.pnlR);
    else if (t.pnlR < -EPS) lossR.push(t.pnlR);
  }
  if (winR.length === 0 || lossR.length === 0) return null;
  const avgWin = winR.reduce((a, b) => a + b, 0) / winR.length;
  const avgLoss = Math.abs(lossR.reduce((a, b) => a + b, 0) / lossR.length);
  return avgLoss < EPS ? null : avgWin / avgLoss;
}

/**
 * Profit Factor = ganancias brutas / pérdidas brutas (en divisa, valor absoluto).
 * `null` si no hay pérdidas (ratio indefinido — no se inventa un número).
 */
export function profitFactor(trades: readonly ClosedTrade[]): number | null {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const t of trades) {
    if (t.pnlCurrency > 0) grossProfit += t.pnlCurrency;
    else grossLoss += Math.abs(t.pnlCurrency);
  }
  return grossLoss < EPS ? null : grossProfit / grossLoss;
}

/**
 * Drawdown máximo sobre la curva de equity acumulada (pico → valle).
 * Se calcula en R y en divisa. Magnitud positiva.
 */
export function maxDrawdown(
  trades: readonly ClosedTrade[],
  propFirmReference: string,
): DrawdownDetail | null {
  if (trades.length === 0) return null;

  const drop = (key: "pnlR" | "pnlCurrency"): number => {
    let peak = 0;
    let cum = 0;
    let maxDd = 0;
    for (const t of trades) {
      const v = key === "pnlR" ? (t.pnlR ?? 0) : t.pnlCurrency;
      cum += v;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  };

  return {
    maxDrawdownR: drop("pnlR"),
    maxDrawdownCurrency: drop("pnlCurrency"),
    propFirmReference,
  };
}

/** Rachas: run ganador más largo, run perdedor más largo, racha actual (signo). */
export function streaks(trades: readonly ClosedTrade[]): StreaksDetail {
  let longestWin = 0;
  let longestLoss = 0;
  let run = 0; // + ganadoras consecutivas, - perdedoras consecutivas

  for (const t of trades) {
    const o = outcomeOf(t);
    if (o === "breakeven") {
      run = 0;
      continue;
    }
    if (o === "win") run = run > 0 ? run + 1 : 1;
    else run = run < 0 ? run - 1 : -1;

    if (run > longestWin) longestWin = run;
    if (-run > longestLoss) longestLoss = -run;
  }

  return { longestWin, longestLoss, currentStreak: run };
}
