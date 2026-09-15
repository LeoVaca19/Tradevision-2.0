import { z } from "zod";
import { BookKind, NotTakenReason } from "./books.js";
import { TradeAnnotationProps } from "./enrichment.js";

export const TradeSide = z.enum(["long", "short"]);
export type TradeSide = z.infer<typeof TradeSide>;

export const TradeOutcome = z.enum(["win", "loss", "breakeven"]);
export type TradeOutcome = z.infer<typeof TradeOutcome>;

/**
 * Datos INMUTABLES de una operación (Tech Spec §5.1). Origen: sincronización de
 * bróker (verified) o alta manual / import (manual). El motor sólo consume estos
 * campos; jamás los de enriquecimiento.
 */
export const TradeCore = z.object({
  id: z.string().uuid(),
  book: BookKind,
  /** `true` sólo para operaciones sincronizadas de bróker. Irreversible. */
  verified: z.boolean(),
  instrument: z.string().min(1),
  side: TradeSide,
  volume: z.number().positive(),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime(),
  commission: z.number().min(0).default(0),
  swap: z.number().default(0),
  /** Resultado neto en la divisa de la cuenta. */
  pnlCurrency: z.number(),
  /** Resultado en múltiplos de R (riesgo inicial). Null si no se conoce el SL. */
  pnlR: z.number().nullable(),
  connectedAccountId: z.string().uuid().nullable(),
  /** Versión del mapeo de ingesta bróker → verified_trades (re-normalizable). */
  engineIngestVersion: z.string().default("0"),
});
export type TradeCore = z.infer<typeof TradeCore>;

/** Operación del Libro Verificado. `verified` siempre `true`. */
export const VerifiedTrade = TradeCore.extend({
  book: z.literal("verified"),
  verified: z.literal(true),
  connectedAccountId: z.string().uuid(),
});
export type VerifiedTrade = z.infer<typeof VerifiedTrade>;

/** Operación del Libro Manual. `verified` siempre `false` (FR-10). */
export const ManualTrade = TradeCore.extend({
  book: z.literal("manual"),
  verified: z.literal(false),
  source: z.enum(["hand", "csv_import", "pdf_import"]).default("hand"),
});
export type ManualTrade = z.infer<typeof ManualTrade>;

/**
 * Libro de No Tomadas (FR-24). No hay ejecución: sin precio de salida ni PnL.
 * Base del contrafactual "Plan vs Ejecutado" (PRD Cambio 5).
 */
export const NotTakenTrade = z.object({
  id: z.string().uuid(),
  book: z.literal("not_taken"),
  instrument: z.string().min(1),
  side: TradeSide,
  identifiedAt: z.string().datetime(),
  reason: NotTakenReason,
  plannedEntry: z.number().positive().nullable(),
  plannedStop: z.number().positive().nullable(),
  plannedTarget: z.number().positive().nullable(),
  /**
   * Resolución objetivo/stop del plan (FR-25). FUERA DEL MVP: se deja el campo
   * pero llega siempre `null` hasta que se implemente el estimador.
   */
  hypotheticalOutcome: TradeOutcome.nullable().default(null),
  hypotheticalPnlR: z.number().nullable().default(null),
});
export type NotTakenTrade = z.infer<typeof NotTakenTrade>;

/** Enriquecimiento anexo (0..1 por operación de cualquier libro). */
export const TradeAnnotation = z.object({
  id: z.string().uuid(),
  tradeId: z.string().uuid(),
  props: TradeAnnotationProps,
  updatedAt: z.string().datetime(),
});
export type TradeAnnotation = z.infer<typeof TradeAnnotation>;

/**
 * Conjunto de entrada del motor. `annotations` se indexa por `tradeId` y sólo se
 * usa para ejes/filtros Declarados; nunca para una cifra Verificada.
 */
export const TradeSet = z.object({
  verified: z.array(VerifiedTrade).default([]),
  manual: z.array(ManualTrade).default([]),
  notTaken: z.array(NotTakenTrade).default([]),
  annotations: z.record(z.string().uuid(), TradeAnnotationProps).default({}),
});
export type TradeSet = z.infer<typeof TradeSet>;
