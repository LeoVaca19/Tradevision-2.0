import { z } from "zod";
import { MarketSession, ChecklistCompliance, HtfBias } from "./enrichment.js";

/**
 * Filtro de los Filtros Forenses Cruzados (FR-66). El motor recalcula la cifra
 * con su nuevo `sample_size` y conserva su etiqueta. Todos los campos opcionales
 * (AND entre los presentes).
 */
export const ForensicFilter = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  instruments: z.array(z.string()).optional(),
  connectedAccountIds: z.array(z.string().uuid()).optional(),
  setupIds: z.array(z.string().uuid()).optional(),
  setupFamilies: z.array(z.string()).optional(),
  /** Lunes=1 … Domingo=7 (ISO). */
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  marketSessions: z.array(MarketSession).optional(),
  htfBias: z.array(HtfBias).optional(),
  checklistCompliance: z.array(ChecklistCompliance).optional(),
  emotionalStateIds: z.array(z.string().uuid()).optional(),
});
export type ForensicFilter = z.infer<typeof ForensicFilter>;

/** Opciones deterministas del motor. `asOf` se pasa siempre — sin reloj implícito. */
export const EngineOptions = z.object({
  engineVersion: z.string(),
  /** Instante de referencia para drawdown "actual", rachas, etc. */
  asOf: z.string().datetime(),
  filter: ForensicFilter.optional(),
  /**
   * Ponderación de los 6 ejes del Radar Score — si se manda, reemplaza a
   * `DEFAULT_RADAR_WEIGHTS` de `@tradevision/engine` (las 6 claves, todas
   * requeridas cuando el objeto está presente). Parametrizable: la ponderación
   * en sí es un punto de partida a calibrar (supuesto abierto del PRD).
   *
   * Nota de migración: en el proyecto anterior este campo había quedado con
   * las claves viejas del Radar (`emotional_discipline`/`efficiency`,
   * retiradas) tras el cambio a ENGINE_VERSION 0.2.0 — nunca se actualizó y
   * no coincidía con `RadarAxis` ni con `DEFAULT_RADAR_WEIGHTS`. Corregido acá
   * para que las claves sean consistentes con el resto del contrato.
   */
  radarWeights: z
    .object({
      win_rate: z.number(),
      profit_factor: z.number(),
      avg_win_loss: z.number(),
      consistency: z.number(),
      risk_management: z.number(),
      recovery: z.number(),
    })
    .optional(),
});
export type EngineOptions = z.infer<typeof EngineOptions>;

/** Salida derivada "Rendimiento del Plan vs Rendimiento Ejecutado" (Cambio 5). */
export const PlanVsExecuted = z.object({
  setupId: z.string().uuid().nullable(),
  periodStart: z.string().datetime().nullable(),
  periodEnd: z.string().datetime().nullable(),
  executed: z.object({
    count: z.number().int().min(0),
    inPlanCount: z.number().int().min(0),
    winRate: z.number().nullable(),
    expectancyR: z.number().nullable(),
  }),
  notTaken: z.object({
    count: z.number().int().min(0),
    inPlanCount: z.number().int().min(0),
    /** Sólo con FR-25 (fuera del MVP): llega null. */
    hypotheticalWinRate: z.number().nullable(),
    hypotheticalExpectancyR: z.number().nullable(),
  }),
  /** Toda la vista es Declarada. Nunca Sello, nunca P&L. */
  sealed: z.literal(false),
  engineVersion: z.string(),
});
export type PlanVsExecuted = z.infer<typeof PlanVsExecuted>;
