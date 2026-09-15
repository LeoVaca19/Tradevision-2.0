import { z } from "zod";

/**
 * LISTA CERRADA de tipos de análisis del Mentor IA (FR-27 ampliado, Tech Spec §10).
 * La lista impide que el modelo invente categorías. La salida de Claude se valida
 * contra este esquema (JSON mode / tool use).
 */
export const MentorAnalysisType = z.enum([
  // --- Psicológicos ---
  "revenge_trading",
  "fear_hesitation",
  "overtrading",
  "moving_stop_loss",
  "early_exit_fear",
  "premature_entry_fomo",
  "oversizing_after_loss",
  // --- Comprensión / tesis (Cambio 2) ---
  "pattern_without_htf_alignment",
  "missing_confluence",
  "wrong_timeframe_for_setup",
  "no_directional_bias",
  "entry_against_htf_structure",
  "setup_not_in_playbook",
]);
export type MentorAnalysisType = z.infer<typeof MentorAnalysisType>;

export const MentorAnalysisCategory = z.enum(["psychological", "thesis"]);
export type MentorAnalysisCategory = z.infer<typeof MentorAnalysisCategory>;

/** Una observación del Mentor IA. PRIVADA, nunca publicable (FR-38). */
export const MentorObservation = z.object({
  type: MentorAnalysisType,
  category: MentorAnalysisCategory,
  /** 0..1. Confianza del modelo; se muestra, no se esconde. */
  confidence: z.number().min(0).max(1),
  /** Texto breve orientado a acción. Sin juicio moral. */
  note: z.string().min(1).max(600),
  /** IDs de operaciones que sustentan la observación (trazabilidad, FR-16). */
  tradeIds: z.array(z.string().uuid()).min(1),
});
export type MentorObservation = z.infer<typeof MentorObservation>;

/** Respuesta estructurada completa del Mentor IA para un lote de análisis. */
export const MentorAnalysisResponse = z.object({
  observations: z.array(MentorObservation),
  /** Etiqueta de procedencia de los datos analizados. */
  dataScope: z.enum(["verified", "declared", "mixed"]),
  model: z.string(),
  generatedAt: z.string().datetime(),
});
export type MentorAnalysisResponse = z.infer<typeof MentorAnalysisResponse>;

export const MENTOR_ANALYSIS_CATEGORY: Record<MentorAnalysisType, MentorAnalysisCategory> = {
  revenge_trading: "psychological",
  fear_hesitation: "psychological",
  overtrading: "psychological",
  moving_stop_loss: "psychological",
  early_exit_fear: "psychological",
  premature_entry_fomo: "psychological",
  oversizing_after_loss: "psychological",
  pattern_without_htf_alignment: "thesis",
  missing_confluence: "thesis",
  wrong_timeframe_for_setup: "thesis",
  no_directional_bias: "thesis",
  entry_against_htf_structure: "thesis",
  setup_not_in_playbook: "thesis",
};
