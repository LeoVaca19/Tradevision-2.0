import {
  MIN_SAMPLE_SIZE,
  type EngineOptions,
  type Metric,
  type StatResult,
  type StatValue,
  type TradeSet,
} from "@tradevision/contracts";
import { applyFilter, filtersHash } from "./filter.js";
import {
  expectancyR,
  maxDrawdown,
  profitFactor,
  rMultipleAvg,
  sortTrades,
  streaks,
  winRate,
  type ClosedTrade,
} from "./metrics.js";

const PROP_FIRM_REFERENCE =
  "Referencia: muchas prop firms fijan el límite de drawdown total entre el 8% y el 12% de la cuenta. Comparación informativa, no es consejo.";

function value(n: number): StatValue {
  return { kind: "value", value: n };
}
function insufficient(sampleSize: number): StatValue {
  return { kind: "insufficient_data", sampleSize };
}

function periodBounds(trades: readonly ClosedTrade[]): {
  start: string | null;
  end: string | null;
} {
  if (trades.length === 0) return { start: null, end: null };
  return {
    start: trades[0]!.closedAt,
    end: trades[trades.length - 1]!.closedAt,
  };
}

/**
 * Motor de analítica — punto de entrada PURO y versionado (FR-14 / FR-16).
 *
 * Sólo calcula sobre el **Libro Verificado** (Tech Spec §7). Las operaciones
 * manuales y las No Tomadas se ignoran aquí; sus vistas Declaradas viven en
 * `radar.ts` y `plan-vs-executed.ts`.
 *
 * Determinista: mismos `input` + misma `opts.engineVersion` ⇒ mismo `StatResult[]`.
 * Por debajo de `MIN_SAMPLE_SIZE` operaciones, cada cifra se marca
 * `insufficient_data` en lugar de devolver un número (FR-14 / FR-29).
 */
export function compute(input: TradeSet, opts: EngineOptions): StatResult[] {
  const { engineVersion, filter } = opts;

  const filtered = applyFilter(input.verified, filter, input.annotations);
  const ordered = sortTrades(filtered);
  const closed: ClosedTrade[] = ordered.map((t) => ({
    id: t.id,
    closedAt: t.closedAt,
    pnlCurrency: t.pnlCurrency,
    pnlR: t.pnlR,
  }));

  const n = closed.length;
  const hash = filtersHash(filter);
  const { start, end } = periodBounds(closed);
  const enough = n >= MIN_SAMPLE_SIZE;

  const base = {
    axis: null,
    book: "verified" as const,
    sealed: true,
    sampleSize: n,
    verifiedPeriodStart: start,
    verifiedPeriodEnd: end,
    engineVersion,
    filtersHash: hash,
  };

  const results: StatResult[] = [];

  const push = (metric: Metric, computed: number | null, detail: StatResult["detail"] = null): void => {
    results.push({
      ...base,
      metric,
      detail,
      value: enough && computed != null ? value(computed) : insufficient(n),
    });
  };

  push("win_rate", winRate(closed));
  push("expectancy", expectancyR(closed));
  push("r_multiple_avg", rMultipleAvg(closed));
  push("profit_factor", profitFactor(closed));

  const dd = maxDrawdown(closed, PROP_FIRM_REFERENCE);
  results.push({
    ...base,
    metric: "max_drawdown",
    detail: dd,
    value: enough && dd != null ? value(dd.maxDrawdownR) : insufficient(n),
  });

  const st = streaks(closed);
  results.push({
    ...base,
    metric: "streaks",
    detail: st,
    value: enough ? value(st.longestWin) : insufficient(n),
  });

  // Sharpe / Z-Score: interfaz reservada, cálculo condicionado a metodología
  // validada (supuesto abierto del PRD). Se emiten siempre como insufficient_data
  // hasta que se implemente, para que la UI ya pueda listarlas.
  results.push({ ...base, metric: "sharpe_ratio", detail: null, value: insufficient(n) });
  results.push({ ...base, metric: "z_score", detail: null, value: insufficient(n) });

  return results;
}
