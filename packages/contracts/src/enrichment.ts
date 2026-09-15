import { z } from "zod";

/**
 * Capa de enriquecimiento (Tech Spec §5.2, §6.1). Propiedades tipadas que el
 * usuario aporta sobre una operación o No Tomada. NUNCA altera precio, volumen,
 * tiempos ni resultado (FR-9) y NUNCA entra en una Estadística Verificada.
 */

export const HtfBias = z.enum(["bullish", "bearish", "range", "undefined"]);
export type HtfBias = z.infer<typeof HtfBias>;

export const ExecutionTimeframe = z.enum(["1m", "5m", "15m", "1H", "4H", "D", "W"]);
export type ExecutionTimeframe = z.infer<typeof ExecutionTimeframe>;

/** Sesión de mercado. Derivable del timestamp, editable (FR-66). */
export const MarketSession = z.enum(["asia", "london", "ny"]);
export type MarketSession = z.infer<typeof MarketSession>;

/** Cumplimiento de checklist: en plan / fuera de plan (FR-66). */
export const ChecklistCompliance = z.enum(["in_plan", "out_of_plan"]);
export type ChecklistCompliance = z.infer<typeof ChecklistCompliance>;

/** Familia / estilo del Setup. Catálogo abierto (FR-21 / FR-66). */
export const SetupFamily = z.string().min(1).max(64);
export type SetupFamily = z.infer<typeof SetupFamily>;

/**
 * Propiedades tipadas del registro tipo Notion. Todas opcionales, editables,
 * con historial. Conjunto conocido y cerrado en el MVP (Tech Spec §6.1) — sin
 * motor EAV genérico. Extensibilidad futura vía `extra` (JSONB reservado).
 */
export const TradeAnnotationProps = z.object({
  setupId: z.string().uuid().optional(),
  setupFamily: SetupFamily.optional(),
  htfBias: HtfBias.optional(),
  confluenceIds: z.array(z.string().uuid()).default([]),
  executionTimeframe: ExecutionTimeframe.optional(),
  marketSession: MarketSession.optional(),
  checklistCompliance: ChecklistCompliance.optional(),
  /**
   * Riesgo declarado sobre ESTA operación (columnas propias, no `extra`: son
   * numéricas y de uso constante — comparar contra LuxAlgo Trade Journal,
   * proyecto anterior PROGRESS.md §5-bis). Nunca recalculan `pnlR` ya guardado
   * en el libro.
   */
  stopLoss: z.number().positive().nullable().optional(),
  profitTarget: z.number().positive().nullable().optional(),
  /** Multi-select. PRIVADO, nunca publicable (FR-38). */
  emotionalStateIds: z.array(z.string().uuid()).default([]),
  extra: z.record(z.unknown()).optional(),
});
export type TradeAnnotationProps = z.infer<typeof TradeAnnotationProps>;
