import { z } from "zod";

/**
 * Segregación Verificado vs Declarado (PRD §4.2, §7, FR-9).
 *
 * - `verified`   → operaciones sincronizadas de bróker. Inmutables, append-only.
 * - `manual`     → alta a mano o import CSV/PDF (FR-67). `verified = false` irreversible.
 * - `not_taken`  → Libro de No Tomadas (FR-24). Setup identificado y no ejecutado.
 *
 * Ninguna cifra puede mezclar libros sin etiquetarla.
 */
export const BookKind = z.enum(["verified", "manual", "not_taken"]);
export type BookKind = z.infer<typeof BookKind>;

/**
 * Etiqueta de procedencia que acompaña a TODA estadística.
 * `mixed` = la cifra combina libro verificado con datos declarados (p. ej. ejes
 * del Radar Score que usan el plan). Nunca lleva Sello.
 */
export const StatBook = z.enum(["verified", "not_taken", "mixed"]);
export type StatBook = z.infer<typeof StatBook>;

/** Motivo por el que una operación identificada no se ejecutó (Libro de No Tomadas). */
export const NotTakenReason = z.enum([
  "fear",
  "doubt",
  "missed_in_time",
  "outside_session",
  "risk_limit_reached",
  "other",
]);
export type NotTakenReason = z.infer<typeof NotTakenReason>;
