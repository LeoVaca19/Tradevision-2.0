import { z } from "zod";
import { StatBook } from "./books.js";

/** Umbral de muestra por debajo del cual una cifra se marca insuficiente (FR-14 / FR-29). */
export const MIN_SAMPLE_SIZE = 30;

/** Métricas del MVP (Tech Spec §7). Sharpe y ZScore: interfaz lista, cálculo condicionado. */
export const Metric = z.enum([
  "win_rate",
  "expectancy",
  "r_multiple_avg",
  "profit_factor",
  "max_drawdown",
  "streaks",
  "sharpe_ratio", // condicionado a metodología validada
  "z_score", // condicionado a metodología validada
]);
export type Metric = z.infer<typeof Metric>;

/**
 * Los 6 ejes del Radar Score (FR-65). PURO DATO CUANTITATIVO: los 6 salen
 * exclusivamente del Libro Verificado — nada declarado/conductual
 * (emotional_discipline, efficiency) se mezcla acá. Lo conductual es un score
 * APARTE, todavía sin construir (decisión heredada del proyecto anterior,
 * ENGINE_VERSION 0.2.0 — ver `../../tradevision/PROGRESS.md` §5-quinquies).
 */
export const RadarAxis = z.enum([
  "win_rate",
  "profit_factor",
  "avg_win_loss",
  "consistency",
  "risk_management",
  "recovery",
]);
export type RadarAxis = z.infer<typeof RadarAxis>;

/** Resultado de una métrica: un número o "datos insuficientes", nunca inventado. */
export const StatValue = z.union([
  z.object({ kind: z.literal("value"), value: z.number() }),
  z.object({ kind: z.literal("insufficient_data"), sampleSize: z.number().int().min(0) }),
]);
export type StatValue = z.infer<typeof StatValue>;

/** Detalle de rachas (metric = "streaks"). */
export const StreaksDetail = z.object({
  longestWin: z.number().int().min(0),
  longestLoss: z.number().int().min(0),
  currentStreak: z.number().int(), // + ganadora, - perdedora
});
export type StreaksDetail = z.infer<typeof StreaksDetail>;

/** Curva de drawdown (metric = "max_drawdown"). */
export const DrawdownDetail = z.object({
  maxDrawdownR: z.number(),
  maxDrawdownCurrency: z.number(),
  /** Referencia textual a límites típicos de prop firm. Texto, NO consejo. */
  propFirmReference: z.string(),
});
export type DrawdownDetail = z.infer<typeof DrawdownDetail>;

/**
 * Salida del motor. Reproducible: mismos datos + misma `engineVersion` ⇒ misma
 * salida (FR-16). Se materializa en `stat_snapshots`.
 */
export const StatResult = z.object({
  metric: Metric,
  /** Sólo para el Radar Score; null para métricas sueltas. */
  axis: RadarAxis.nullable().default(null),
  book: StatBook,
  /** INVARIANTE: si `book != "verified"` ⇒ `sealed = false`. */
  sealed: z.boolean(),
  value: StatValue,
  detail: z.union([StreaksDetail, DrawdownDetail, z.null()]).default(null),
  sampleSize: z.number().int().min(0),
  verifiedPeriodStart: z.string().datetime().nullable(),
  verifiedPeriodEnd: z.string().datetime().nullable(),
  engineVersion: z.string(),
  /** Hash del filtro aplicado (Filtros Forenses Cruzados, FR-66). null = sin filtro. */
  filtersHash: z.string().nullable().default(null),
});
export type StatResult = z.infer<typeof StatResult>;

/**
 * Radar Score compuesto (FR-65). SIEMPRE Estadística Declarada (`sealed: false`),
 * SIEMPRE desglosado por eje, sin ranking entre usuarios.
 */
export const RadarScore = z.object({
  composite: StatValue,
  sealed: z.literal(false),
  axes: z.array(
    z.object({
      axis: RadarAxis,
      value: StatValue,
      book: StatBook,
      sealed: z.boolean(),
      sampleSize: z.number().int().min(0),
      weight: z.number().min(0).max(1),
    }),
  ),
  engineVersion: z.string(),
});
export type RadarScore = z.infer<typeof RadarScore>;
