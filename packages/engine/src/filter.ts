import type { ForensicFilter, TradeAnnotationProps, TradeCore } from "@tradevision/contracts";

/**
 * Filtros Forenses Cruzados (FR-66). Aplica un `ForensicFilter` a una lista de
 * operaciones. Los atributos declarados (setup, familia, sesión, sesgo HTF,
 * checklist, estado emocional) se leen del mapa de anotaciones; el día de la
 * semana se deriva del `closedAt` en UTC (ISO: lunes=1 … domingo=7).
 *
 * Puro: no consulta nada; recibe el mapa de anotaciones ya resuelto.
 */
export function applyFilter<T extends Pick<TradeCore, "id" | "instrument" | "closedAt" | "connectedAccountId">>(
  trades: readonly T[],
  filter: ForensicFilter | undefined,
  annotations: Record<string, TradeAnnotationProps>,
): T[] {
  if (!filter) return [...trades];

  return trades.filter((t) => {
    const a = annotations[t.id];

    if (filter.periodStart && t.closedAt < filter.periodStart) return false;
    if (filter.periodEnd && t.closedAt > filter.periodEnd) return false;

    if (filter.instruments?.length && !filter.instruments.includes(t.instrument)) return false;

    if (filter.connectedAccountIds?.length) {
      if (!t.connectedAccountId || !filter.connectedAccountIds.includes(t.connectedAccountId)) return false;
    }

    if (filter.weekdays?.length) {
      const d = new Date(t.closedAt).getUTCDay(); // 0=domingo
      const iso = d === 0 ? 7 : d;
      if (!filter.weekdays.includes(iso)) return false;
    }

    // --- atributos declarados (requieren anotación) ---
    if (filter.setupIds?.length && (!a?.setupId || !filter.setupIds.includes(a.setupId))) return false;
    if (filter.setupFamilies?.length && (!a?.setupFamily || !filter.setupFamilies.includes(a.setupFamily)))
      return false;
    if (filter.marketSessions?.length && (!a?.marketSession || !filter.marketSessions.includes(a.marketSession)))
      return false;
    if (filter.htfBias?.length && (!a?.htfBias || !filter.htfBias.includes(a.htfBias))) return false;
    if (
      filter.checklistCompliance?.length &&
      (!a?.checklistCompliance || !filter.checklistCompliance.includes(a.checklistCompliance))
    )
      return false;
    if (filter.emotionalStateIds?.length) {
      const ids = a?.emotionalStateIds ?? [];
      if (!filter.emotionalStateIds.some((id) => ids.includes(id))) return false;
    }

    return true;
  });
}

/**
 * Hash estable de un filtro para `stat_snapshots.filters_hash` (FR-66).
 * Orden de claves normalizado ⇒ mismo filtro produce siempre el mismo hash.
 */
export function filtersHash(filter: ForensicFilter | undefined): string | null {
  if (!filter || Object.keys(filter).length === 0) return null;
  const normalized = normalize(filter);
  const json = JSON.stringify(normalized);
  // FNV-1a 32-bit — determinista y sin dependencias.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return [...value].map(normalize).sort(compareJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  return value;
}

function compareJson(a: unknown, b: unknown): number {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
