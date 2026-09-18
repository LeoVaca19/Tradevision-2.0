import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  EngineOptions,
  ManualTrade,
  NotTakenTrade,
  RadarScore,
  StatResult,
  TradeAnnotationProps,
  TradeSet,
  VerifiedTrade,
} from "@tradevision/contracts";
import { ENGINE_VERSION, compute, computeRadarScore, filtersHash as computeFiltersHash } from "@tradevision/engine";
import type { DB } from "../client.js";
import {
  annotationConfluences,
  annotationEmotionalStates,
  manualTrades,
  notTakenTrades,
  statSnapshots,
  tradeAnnotations,
  verifiedTrades,
} from "../schema.js";
import { toDbNumericOrNull, toNumber, toNumberOrNull } from "../numeric.js";

/**
 * Puente BD → motor de analítica (Tech Spec §7). `packages/engine` sigue puro y
 * en memoria; este archivo es el ÚNICO sitio que traduce filas de Postgres a la
 * forma exacta de `TradeSet` (@tradevision/contracts) que el motor espera.
 *
 * CRÍTICO: `verified.*`/`manual.*`/`notTaken.*` numéricos (volume, precios,
 * comisión, swap, pnl, planeados) llegan de Postgres como `string` (columnas
 * `numeric`, Bloque 4) — si se pasan sin convertir, el motor hace aritmética
 * de JS sobre strings (concatenación / NaN) en silencio. Se convierten acá,
 * antes de ensamblar el `TradeSet`.
 */

export interface LoadTradeSetOptions {
  /** Filtra por `closedAt` (verified/manual) e `identifiedAt` (no tomadas). */
  periodStart?: Date;
  periodEnd?: Date;
}

const iso = (d: Date): string => d.toISOString();

export async function loadTradeSet(
  db: DB,
  userId: string,
  opts: LoadTradeSetOptions = {},
): Promise<TradeSet> {
  const periodCond = (col: typeof verifiedTrades.closedAt) => {
    const clauses = [eq(verifiedTrades.userId, userId)];
    if (opts.periodStart) clauses.push(gte(col, opts.periodStart));
    if (opts.periodEnd) clauses.push(lte(col, opts.periodEnd));
    return and(...clauses);
  };

  const [verifiedRows, manualRows, notTakenRows, annotationRows] = await Promise.all([
    db.select().from(verifiedTrades).where(periodCond(verifiedTrades.closedAt)),
    db
      .select()
      .from(manualTrades)
      .where(
        and(
          eq(manualTrades.userId, userId),
          opts.periodStart ? gte(manualTrades.closedAt, opts.periodStart) : undefined,
          opts.periodEnd ? lte(manualTrades.closedAt, opts.periodEnd) : undefined,
        ),
      ),
    db
      .select()
      .from(notTakenTrades)
      .where(
        and(
          eq(notTakenTrades.userId, userId),
          opts.periodStart ? gte(notTakenTrades.identifiedAt, opts.periodStart) : undefined,
          opts.periodEnd ? lte(notTakenTrades.identifiedAt, opts.periodEnd) : undefined,
        ),
      ),
    db.select().from(tradeAnnotations).where(eq(tradeAnnotations.userId, userId)),
  ]);

  // Joins de estados emocionales / confluencias, agrupados por annotationId.
  //
  // Nota de migración: el proyecto anterior usaba `sql\`col = any(${array})\`` a
  // mano acá. Con un array de UN elemento, postgres-js lo serializa mal
  // ("malformed array literal": lo manda como string suelto en vez de array),
  // rompiendo `loadTradeSet` en cuanto hay una sola anotación — encontrado al
  // probar este repo contra Supabase real. `inArray()` es el operador de
  // Drizzle pensado para esto: serializa bien con 0, 1 o N elementos.
  const annotationIds = annotationRows.map((a) => a.id);
  const [emoRows, confRows] = annotationIds.length
    ? await Promise.all([
        db
          .select()
          .from(annotationEmotionalStates)
          .where(inArray(annotationEmotionalStates.annotationId, annotationIds)),
        db
          .select()
          .from(annotationConfluences)
          .where(inArray(annotationConfluences.annotationId, annotationIds)),
      ])
    : [[], []];

  const emoByAnnotation = new Map<string, string[]>();
  for (const r of emoRows) {
    const list = emoByAnnotation.get(r.annotationId) ?? [];
    list.push(r.emotionalStateId);
    emoByAnnotation.set(r.annotationId, list);
  }
  const confByAnnotation = new Map<string, string[]>();
  for (const r of confRows) {
    const list = confByAnnotation.get(r.annotationId) ?? [];
    list.push(r.confluenceId);
    confByAnnotation.set(r.annotationId, list);
  }

  const annotations: Record<string, TradeAnnotationProps> = {};
  for (const a of annotationRows) {
    const tradeId = a.verifiedTradeId ?? a.manualTradeId ?? a.notTakenTradeId;
    if (!tradeId) continue; // no debería pasar (CHECK annotation_exactly_one_book)
    annotations[tradeId] = {
      setupId: a.setupId ?? undefined,
      setupFamily: a.setupFamily ?? undefined,
      htfBias: a.htfBias ?? undefined,
      executionTimeframe: a.executionTimeframe ?? undefined,
      marketSession: a.marketSession ?? undefined,
      checklistCompliance: a.checklistCompliance ?? undefined,
      confluenceIds: confByAnnotation.get(a.id) ?? [],
      emotionalStateIds: emoByAnnotation.get(a.id) ?? [],
      extra: (a.extra as Record<string, unknown> | null) ?? undefined,
    };
  }

  const verified: VerifiedTrade[] = verifiedRows.map((t) => ({
    id: t.id,
    book: "verified",
    verified: true,
    instrument: t.instrument,
    side: t.side,
    volume: toNumber(t.volume),
    entryPrice: toNumber(t.entryPrice),
    exitPrice: toNumber(t.exitPrice),
    openedAt: iso(t.openedAt),
    closedAt: iso(t.closedAt),
    commission: toNumber(t.commission),
    swap: toNumber(t.swap),
    pnlCurrency: toNumber(t.pnlCurrency),
    pnlR: toNumberOrNull(t.pnlR),
    connectedAccountId: t.connectedAccountId,
    engineIngestVersion: t.engineIngestVersion,
  }));

  const manual: ManualTrade[] = manualRows.map((t) => ({
    id: t.id,
    book: "manual",
    verified: false,
    instrument: t.instrument,
    side: t.side,
    volume: toNumber(t.volume),
    entryPrice: toNumber(t.entryPrice),
    exitPrice: toNumber(t.exitPrice),
    openedAt: iso(t.openedAt),
    closedAt: iso(t.closedAt),
    commission: toNumber(t.commission),
    swap: toNumber(t.swap),
    pnlCurrency: toNumber(t.pnlCurrency),
    pnlR: toNumberOrNull(t.pnlR),
    connectedAccountId: null,
    engineIngestVersion: "0",
    source: t.source,
  }));

  const notTaken: NotTakenTrade[] = notTakenRows.map((t) => ({
    id: t.id,
    book: "not_taken",
    instrument: t.instrument,
    side: t.side,
    identifiedAt: iso(t.identifiedAt),
    reason: t.reason,
    plannedEntry: toNumberOrNull(t.plannedEntry),
    plannedStop: toNumberOrNull(t.plannedStop),
    plannedTarget: toNumberOrNull(t.plannedTarget),
    hypotheticalOutcome: t.hypotheticalOutcome ?? null,
    hypotheticalPnlR: toNumberOrNull(t.hypotheticalPnlR),
  }));

  return { verified, manual, notTaken, annotations };
}

// ─────────────────────────  Snapshots (materialización)  ─────────────────────────

/**
 * Guarda snapshots del motor (FR-14/16/65). INSERT, no upsert: `stat_snapshots`
 * conserva histórico por `computed_at`; `getLatestStatSnapshots` lee sólo el más
 * reciente de cada (metric, axis). Filas del Radar reutilizan la tabla con
 * `metric = 'radar_axis' | 'radar_composite'` (ver comentario en schema.ts).
 */
export async function saveStatSnapshots(
  db: DB,
  userId: string,
  input: {
    engineVersion: string;
    filtersHash: string | null;
    metrics?: StatResult[];
    radar?: RadarScore;
  },
): Promise<void> {
  const rows: (typeof statSnapshots.$inferInsert)[] = [];

  for (const r of input.metrics ?? []) {
    rows.push({
      userId,
      metric: r.metric,
      axis: null,
      book: r.book,
      sealed: r.sealed,
      value: toDbNumericOrNull(r.value.kind === "value" ? r.value.value : null),
      insufficientData: r.value.kind === "insufficient_data",
      detail: r.detail,
      sampleSize: r.sampleSize,
      verifiedPeriodStart: r.verifiedPeriodStart ? new Date(r.verifiedPeriodStart) : null,
      verifiedPeriodEnd: r.verifiedPeriodEnd ? new Date(r.verifiedPeriodEnd) : null,
      engineVersion: r.engineVersion,
      filtersHash: r.filtersHash,
    });
  }

  if (input.radar) {
    const maxSample = Math.max(0, ...input.radar.axes.map((a) => a.sampleSize));
    rows.push({
      userId,
      metric: "radar_composite",
      axis: null,
      book: "mixed",
      sealed: false, // invariante FR-65: el compuesto nunca lleva Sello
      value: toDbNumericOrNull(input.radar.composite.kind === "value" ? input.radar.composite.value : null),
      insufficientData: input.radar.composite.kind === "insufficient_data",
      detail: null,
      sampleSize: maxSample,
      engineVersion: input.radar.engineVersion,
      filtersHash: input.filtersHash,
    });
    for (const a of input.radar.axes) {
      rows.push({
        userId,
        metric: "radar_axis",
        axis: a.axis,
        book: a.book,
        sealed: a.sealed,
        value: toDbNumericOrNull(a.value.kind === "value" ? a.value.value : null),
        insufficientData: a.value.kind === "insufficient_data",
        detail: null,
        sampleSize: a.sampleSize,
        engineVersion: input.radar.engineVersion,
        filtersHash: input.filtersHash,
      });
    }
  }

  if (rows.length > 0) await db.insert(statSnapshots).values(rows);
}

// ─────────────────────────  Materialización (job/endpoint)  ─────────────────────────

export interface MaterializeStatSnapshotsOptions {
  engineVersion?: string;
  /** Instante de referencia del motor. Por defecto, ahora. */
  asOf?: string;
  filter?: EngineOptions["filter"];
  radarWeights?: EngineOptions["radarWeights"];
}

export interface MaterializeStatSnapshotsResult {
  metrics: StatResult[];
  radar: RadarScore;
}

/**
 * Corre el motor (`compute` + `computeRadarScore`) sobre el `TradeSet` real del
 * usuario y persiste el resultado en `stat_snapshots` — el paso que faltaba
 * entre `loadTradeSet`/`saveStatSnapshots` (Tech Spec §7, recalculo descrito en
 * §7: "un job Inngest re-materializa `stat_snapshots`..."). Esta función ES el
 * cuerpo de ese job; no decide cuándo correr (eso lo dispara quien la invoque:
 * un job Inngest, una Server Action, un cron) ni construye esa infraestructura,
 * ausente todavía en el monorepo (`STATUS.md`).
 *
 * No incluye `computePlanVsExecuted`: esa vista es siempre Declarada y no tiene
 * fila en `stat_snapshots` (no aplica un Sello que preservar entre corridas).
 */
export async function materializeStatSnapshots(
  db: DB,
  userId: string,
  opts: MaterializeStatSnapshotsOptions = {},
): Promise<MaterializeStatSnapshotsResult> {
  const engineVersion = opts.engineVersion ?? ENGINE_VERSION;
  const engineOpts: EngineOptions = {
    engineVersion,
    asOf: opts.asOf ?? new Date().toISOString(),
    filter: opts.filter,
    radarWeights: opts.radarWeights,
  };

  const set = await loadTradeSet(db, userId, {
    periodStart: opts.filter?.periodStart ? new Date(opts.filter.periodStart) : undefined,
    periodEnd: opts.filter?.periodEnd ? new Date(opts.filter.periodEnd) : undefined,
  });

  const metrics = compute(set, engineOpts);
  const radar = computeRadarScore(set, engineOpts);

  await saveStatSnapshots(db, userId, {
    engineVersion,
    filtersHash: computeFiltersHash(engineOpts.filter),
    metrics,
    radar,
  });

  return { metrics, radar };
}

export async function getLatestStatSnapshots(
  db: DB,
  userId: string,
  filters: { engineVersion: string; filtersHash: string | null },
) {
  const filtersHashCond =
    filters.filtersHash === null
      ? sql`${statSnapshots.filtersHash} is null`
      : eq(statSnapshots.filtersHash, filters.filtersHash);

  const rows = await db
    .select()
    .from(statSnapshots)
    .where(
      and(
        eq(statSnapshots.userId, userId),
        eq(statSnapshots.engineVersion, filters.engineVersion),
        filtersHashCond,
      ),
    )
    .orderBy(sql`${statSnapshots.metric}, ${statSnapshots.axis}, ${statSnapshots.computedAt} desc`);

  // dedupe a "el más reciente por (metric, axis)" en JS: es una tabla pequeña
  // por usuario y evita depender de DISTINCT ON (menos portable entre drivers).
  const seen = new Set<string>();
  const latest: (typeof rows)[number][] = [];
  for (const r of rows) {
    const key = `${r.metric}:${r.axis ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return latest.map((r) => ({ ...r, value: toNumberOrNull(r.value) }));
}
