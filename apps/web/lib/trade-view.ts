import { TradeAnnotationProps } from "@tradevision/contracts";

export type TradeBook = "verified" | "manual" | "not_taken";

export const BOOK_LABEL: Record<TradeBook, string> = {
  verified: "Libro Verificado",
  manual: "Libro Manual",
  not_taken: "Libro de No Tomadas",
};

interface AnnotationRow {
  setupId?: string | null;
  setupFamily?: string | null;
  htfBias?: string | null;
  executionTimeframe?: string | null;
  marketSession?: string | null;
  checklistCompliance?: string | null;
  stopLoss?: number | null;
  profitTarget?: number | null;
  extra?: unknown;
  emotionalStateIds?: string[];
  confluenceIds?: string[];
  journalNote?: unknown;
}

/** Normaliza la fila de `trade_annotations` (+ joins) al contrato tipado. */
export function toAnnotationProps(row: AnnotationRow | null | undefined): TradeAnnotationProps {
  return TradeAnnotationProps.parse({
    setupId: row?.setupId ?? undefined,
    setupFamily: row?.setupFamily ?? undefined,
    htfBias: row?.htfBias ?? undefined,
    executionTimeframe: row?.executionTimeframe ?? undefined,
    marketSession: row?.marketSession ?? undefined,
    checklistCompliance: row?.checklistCompliance ?? undefined,
    stopLoss: row?.stopLoss ?? undefined,
    profitTarget: row?.profitTarget ?? undefined,
    confluenceIds: row?.confluenceIds ?? [],
    emotionalStateIds: row?.emotionalStateIds ?? [],
    extra: (row?.extra as Record<string, unknown> | undefined) ?? undefined,
  });
}

/**
 * Nota de migración (Bloque 8): el proyecto anterior tipaba esto como
 * `PartialBlock[]` de `@blocknote/core`. Ese paquete es del Bloque 9 (UI) —
 * este bloque es solo datos, sin dependencias de editor. `unknown[]` acá;
 * quien construya `<TradeJournalEditor>` en el Bloque 9 hace el cast final
 * contra el tipo real de BlockNote.
 */
export function toBlockNoteContent(json: unknown): unknown[] | undefined {
  if (Array.isArray(json) && json.length > 0) return json;
  return undefined;
}
