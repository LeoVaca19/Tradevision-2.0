import {
  MIN_SAMPLE_SIZE,
  type EngineOptions,
  type RadarAxis,
  type RadarScore,
  type StatBook,
  type StatValue,
  type TradeSet,
} from "@tradevision/contracts";
import { applyFilter } from "./filter.js";
import { maxDrawdown, profitFactor, rMultipleAvg, sortTrades, winRate, type ClosedTrade } from "./metrics.js";

/**
 * Radar Score (FR-65). Índice compuesto de diagnóstico sobre 6 ejes.
 *
 * PURO DATO CUANTITATIVO (decisión heredada del proyecto anterior, 2026-09-12,
 * decisión de Leonardo): los 6 ejes salen EXCLUSIVAMENTE del Libro Verificado —
 * nada declarado/conductual (antes `emotional_discipline` sobre
 * `not_taken_trades`, `efficiency` mezclando ejecutadas/no-tomadas). Lo
 * conductual queda para un score APARTE, todavía sin construir. `avg_win_loss`
 * (payoff ratio) y `recovery` (recovery factor) entran para mantener 6 ejes;
 * ambos ya se calculan en `metrics.ts`.
 *
 * INVARIANTES:
 *  - El compuesto es SIEMPRE Estadística Declarada (`sealed: false`) — el
 *    COMPUESTO en sí (media ponderada) no es un Sello aunque sus 6 ejes sí
 *    lo sean individualmente; el Sello es por cifra, no por agregado (Tech
 *    Spec §1.1).
 *  - SIEMPRE se devuelve desglosado por eje; nunca el compuesto solo.
 *  - Cada eje declara su(s) libro(s) y su Sello por separado — hoy los 6
 *    llevan `book: "verified"` y `sealed: true`.
 *  - Un eje sin muestra suficiente devuelve `insufficient_data`, no un número.
 *  - Sin ranking entre usuarios, sin premio a la actividad.
 *
 * SUPUESTO ABIERTO (PRD §16): la normalización a 0..100, los umbrales de
 * "puntaje pleno" y la ponderación de los 6 ejes son un PUNTO DE PARTIDA. Se
 * calibran con datos reales y con los primeros Mentores. Cualquier cambio
 * incrementa ENGINE_VERSION.
 */

export const DEFAULT_RADAR_WEIGHTS: Record<RadarAxis, number> = {
  win_rate: 0.15,
  profit_factor: 0.2,
  avg_win_loss: 0.15,
  consistency: 0.15,
  risk_management: 0.15,
  recovery: 0.2,
};

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));

function val(n: number): StatValue {
  return { kind: "value", value: n };
}
function insuff(s: number): StatValue {
  return { kind: "insufficient_data", sampleSize: s };
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

interface AxisResult {
  axis: RadarAxis;
  value: StatValue;
  book: StatBook;
  sealed: boolean;
  sampleSize: number;
}

export function computeRadarScore(input: TradeSet, opts: EngineOptions): RadarScore {
  const weights = { ...DEFAULT_RADAR_WEIGHTS, ...(opts.radarWeights ?? {}) };

  const verified = sortTrades(applyFilter(input.verified, opts.filter, input.annotations)).map<ClosedTrade>(
    (t) => ({ id: t.id, closedAt: t.closedAt, pnlCurrency: t.pnlCurrency, pnlR: t.pnlR }),
  );
  const rs = verified.map((t) => t.pnlR).filter((r): r is number => r != null);
  const nV = verified.length;
  const enoughV = nV >= MIN_SAMPLE_SIZE;

  const axes: AxisResult[] = [];

  // --- Win Rate → verificado, con Sello ---
  {
    const wr = winRate(verified);
    axes.push({
      axis: "win_rate",
      value: enoughV && wr != null ? val(clamp(wr * 100)) : insuff(nV),
      book: "verified",
      sealed: true,
      sampleSize: nV,
    });
  }

  // --- Profit Factor → verificado, con Sello. PF 1.0→50, 2.0→100 (punto de partida). ---
  {
    const pf = profitFactor(verified);
    axes.push({
      axis: "profit_factor",
      value: enoughV && pf != null ? val(clamp((pf / 2) * 100)) : insuff(nV),
      book: "verified",
      sealed: true,
      sampleSize: nV,
    });
  }

  // --- Consistencia → verificado, con Sello. Menor dispersión de R ⇒ mayor score. ---
  {
    const cv = rs.length >= 2 && Math.abs(mean(rs)) > 1e-9 ? stddev(rs) / Math.abs(mean(rs)) : Infinity;
    const score = Number.isFinite(cv) ? clamp(100 - cv * 25) : 0;
    axes.push({
      axis: "consistency",
      value: enoughV && rs.length >= 2 ? val(score) : insuff(nV),
      book: "verified",
      sealed: true,
      sampleSize: nV,
    });
  }

  // --- Gestión de Riesgo → verificado, con Sello. Dispersión del riesgo por
  //     operación (proxy: dispersión de |R| de las perdedoras). Sólo usa
  //     pnlR del Libro Verificado — pura, no "mixta". ---
  {
    const lossR = rs.filter((r) => r < 0).map((r) => Math.abs(r));
    const sd = stddev(lossR);
    const score = lossR.length >= 2 ? clamp(100 - sd * 40) : 0;
    axes.push({
      axis: "risk_management",
      value: enoughV && lossR.length >= 2 ? val(score) : insuff(nV),
      book: "verified",
      sealed: true,
      sampleSize: nV,
    });
  }

  // --- Payoff ratio (avg win / avg loss, en R) → verificado, con Sello.
  //     Punto de partida: 2.5:1 = puntaje pleno (misma referencia usada en el
  //     proyecto anterior, comparada contra LuxAlgo — recalibrable). ---
  {
    const ratio = rMultipleAvg(verified);
    axes.push({
      axis: "avg_win_loss",
      value: enoughV && ratio != null ? val(clamp((ratio / 2.5) * 100)) : insuff(nV),
      book: "verified",
      sealed: true,
      sampleSize: nV,
    });
  }

  // --- Recovery factor (R neto / drawdown máximo, en R) → verificado, con Sello.
  //     Punto de partida: neto = 3× el drawdown máximo ⇒ puntaje pleno. En R,
  //     no en divisa: no depende del tamaño de cuenta (varias cuentas, distinto
  //     balance). ---
  {
    const dd = maxDrawdown(verified, "");
    const netR = rs.reduce((a, b) => a + b, 0);
    const score =
      dd && dd.maxDrawdownR > 1e-9 ? clamp((netR / dd.maxDrawdownR / 3) * 100) : netR > 0 ? 100 : 0;
    axes.push({
      axis: "recovery",
      value: enoughV && dd ? val(score) : insuff(nV),
      book: "verified",
      sealed: true,
      sampleSize: nV,
    });
  }

  // --- Compuesto: media ponderada de los ejes CON valor. Siempre Declarada. ---
  const scored = axes.filter(
    (a): a is AxisResult & { value: { kind: "value"; value: number } } => a.value.kind === "value",
  );
  const totalWeight = scored.reduce((s, a) => s + weights[a.axis], 0);
  const composite: StatValue =
    scored.length >= 3 && totalWeight > 0
      ? val(scored.reduce((s, a) => s + a.value.value * weights[a.axis], 0) / totalWeight)
      : insuff(nV);

  return {
    composite,
    sealed: false,
    axes: axes.map((a) => ({ ...a, weight: weights[a.axis] })),
    engineVersion: opts.engineVersion,
  };
}
