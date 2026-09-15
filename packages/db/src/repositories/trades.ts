import { and, desc, eq, sql } from "drizzle-orm";
import type { TradeAnnotationProps } from "@tradevision/contracts";
import type { DB } from "../client.js";
import {
  annotationConfluences,
  annotationEmotionalStates,
  confluences,
  emotionalStates,
  manualTrades,
  notTakenTrades,
  publicAnnotations,
  tradeAnnotations,
  users,
  verifiedTrades,
} from "../schema.js";
import { assertCatalogIdsVisible } from "./catalogs.js";
import { toDbNumeric, toDbNumericOrNull, toNumber, toNumberOrNull } from "../numeric.js";

/**
 * Acceso a datos de operaciones. Regla que esta capa NO puede romper (Tech Spec
 * §1.1, FR-9): una anotación jamás toca precio / volumen / tiempos / resultado
 * de la operación. `upsertAnnotation` sólo escribe en `trade_annotations` y sus
 * tablas de unión; nunca en `verified_trades` / `manual_trades` / `not_taken_trades`.
 */

export type TradeBook = "verified" | "manual" | "not_taken";

const BOOK_FK = {
  verified: "verifiedTradeId",
  manual: "manualTradeId",
  not_taken: "notTakenTradeId",
} as const;

/** Campos `numeric` de una operación (verificada o manual) — string en la fila cruda. */
const CORE_MONEY_FIELDS = ["volume", "entryPrice", "exitPrice", "commission", "swap", "pnlCurrency"] as const;

function convertCoreMoney<T extends Record<(typeof CORE_MONEY_FIELDS)[number] | "pnlR", string | null>>(
  row: T,
): Omit<T, (typeof CORE_MONEY_FIELDS)[number] | "pnlR"> & {
  volume: number;
  entryPrice: number;
  exitPrice: number;
  commission: number;
  swap: number;
  pnlCurrency: number;
  pnlR: number | null;
} {
  return {
    ...row,
    volume: toNumber(row.volume as string),
    entryPrice: toNumber(row.entryPrice as string),
    exitPrice: toNumber(row.exitPrice as string),
    commission: toNumber(row.commission as string),
    swap: toNumber(row.swap as string),
    pnlCurrency: toNumber(row.pnlCurrency as string),
    pnlR: toNumberOrNull(row.pnlR),
  };
}

// ─────────────────────────────  Altas de operación  ─────────────────────────────

export interface ManualTradeInput {
  instrument: string;
  side: "long" | "short";
  volume: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: Date;
  closedAt: Date;
  commission?: number;
  swap?: number;
  pnlCurrency: number;
  pnlR?: number | null;
  source?: "hand" | "csv_import" | "pdf_import";
  importBatchId?: string | null;
}

export async function createManualTrade(db: DB, userId: string, input: ManualTradeInput) {
  const [row] = await db
    .insert(manualTrades)
    .values({
      userId,
      verified: false, // irreversible (además del CHECK `manual_never_verified`)
      source: input.source ?? "hand",
      importBatchId: input.importBatchId ?? null,
      instrument: input.instrument,
      side: input.side,
      volume: toDbNumeric(input.volume),
      entryPrice: toDbNumeric(input.entryPrice),
      exitPrice: toDbNumeric(input.exitPrice),
      openedAt: input.openedAt,
      closedAt: input.closedAt,
      commission: toDbNumeric(input.commission ?? 0),
      swap: toDbNumeric(input.swap ?? 0),
      pnlCurrency: toDbNumeric(input.pnlCurrency),
      pnlR: toDbNumericOrNull(input.pnlR ?? null),
    })
    .returning();
  return convertCoreMoney(row!);
}

export interface NotTakenTradeInput {
  instrument: string;
  side: "long" | "short";
  identifiedAt: Date;
  reason: "fear" | "doubt" | "missed_in_time" | "outside_session" | "risk_limit_reached" | "other";
  plannedEntry?: number | null;
  plannedStop?: number | null;
  plannedTarget?: number | null;
}

export async function createNotTakenTrade(db: DB, userId: string, input: NotTakenTradeInput) {
  const [row] = await db
    .insert(notTakenTrades)
    .values({
      userId,
      instrument: input.instrument,
      side: input.side,
      identifiedAt: input.identifiedAt,
      reason: input.reason,
      plannedEntry: toDbNumericOrNull(input.plannedEntry ?? null),
      plannedStop: toDbNumericOrNull(input.plannedStop ?? null),
      plannedTarget: toDbNumericOrNull(input.plannedTarget ?? null),
    })
    .returning();
  return {
    ...row!,
    plannedEntry: toNumberOrNull(row!.plannedEntry),
    plannedStop: toNumberOrNull(row!.plannedStop),
    plannedTarget: toNumberOrNull(row!.plannedTarget),
    hypotheticalPnlR: toNumberOrNull(row!.hypotheticalPnlR),
  };
}

// ─────────────────────────────  Listado  ─────────────────────────────

export async function listManualTrades(db: DB, userId: string) {
  const rows = await db
    .select()
    .from(manualTrades)
    .where(eq(manualTrades.userId, userId))
    .orderBy(desc(manualTrades.closedAt));
  return rows.map(convertCoreMoney);
}

export async function listNotTakenTrades(db: DB, userId: string) {
  const rows = await db
    .select()
    .from(notTakenTrades)
    .where(eq(notTakenTrades.userId, userId))
    .orderBy(desc(notTakenTrades.identifiedAt));
  return rows.map((r) => ({
    ...r,
    plannedEntry: toNumberOrNull(r.plannedEntry),
    plannedStop: toNumberOrNull(r.plannedStop),
    plannedTarget: toNumberOrNull(r.plannedTarget),
    hypotheticalPnlR: toNumberOrNull(r.hypotheticalPnlR),
  }));
}

export interface ManualTradeWithAnnotationSummary {
  id: string;
  instrument: string;
  side: "long" | "short";
  openedAt: Date;
  closedAt: Date;
  pnlCurrency: number;
  pnlR: number | null;
  /** Primer elemento de `props.extra.attachments`, o null si no hay ninguno. */
  firstAttachmentKey: string | null;
  /** `journal_note` es un array de bloques BlockNote con al menos uno. */
  hasJournalNote: boolean;
}

/**
 * Libro Manual del usuario + resumen de su anotación (miniatura + si tiene
 * diario), en UNA sola consulta (LEFT JOIN). Evita el N+1 de pedir
 * `getTradeWithAnnotation` operación por operación sólo para pintar la galería
 * (`/trades`, vista Galería). No trae `journal_note` completo ni el resto de
 * `props` — sólo los dos derivados que necesita la tarjeta.
 */
export async function listManualTradesWithAnnotationSummary(
  db: DB,
  userId: string,
): Promise<ManualTradeWithAnnotationSummary[]> {
  const rows = await db
    .select({
      id: manualTrades.id,
      instrument: manualTrades.instrument,
      side: manualTrades.side,
      openedAt: manualTrades.openedAt,
      closedAt: manualTrades.closedAt,
      pnlCurrency: manualTrades.pnlCurrency,
      pnlR: manualTrades.pnlR,
      firstAttachmentKey: sql<string | null>`
        case
          when jsonb_typeof(${tradeAnnotations.extra} -> 'attachments') = 'array'
          then ${tradeAnnotations.extra} -> 'attachments' ->> 0
          else null
        end
      `,
      hasJournalNote: sql<boolean>`
        coalesce(
          jsonb_typeof(${tradeAnnotations.journalNote}) = 'array'
            and jsonb_array_length(${tradeAnnotations.journalNote}) > 0,
          false
        )
      `,
    })
    .from(manualTrades)
    .leftJoin(
      tradeAnnotations,
      and(eq(tradeAnnotations.manualTradeId, manualTrades.id), eq(tradeAnnotations.userId, userId)),
    )
    .where(eq(manualTrades.userId, userId))
    .orderBy(desc(manualTrades.closedAt));
  return rows.map((r) => ({ ...r, pnlCurrency: toNumber(r.pnlCurrency), pnlR: toNumberOrNull(r.pnlR) }));
}

// ─────────────────────────  Lectura con enriquecimiento  ─────────────────────────

export interface TradeWithAnnotation {
  book: TradeBook;
  trade: Record<string, unknown>;
  annotation:
    | (Record<string, unknown> & { emotionalStateIds: string[]; confluenceIds: string[] })
    | null;
}

async function loadCore(
  db: DB,
  userId: string,
  book: TradeBook,
  tradeId: string,
): Promise<Record<string, unknown> | null> {
  if (book === "verified") {
    const [row] = await db
      .select()
      .from(verifiedTrades)
      .where(and(eq(verifiedTrades.id, tradeId), eq(verifiedTrades.userId, userId)));
    return row ? convertCoreMoney(row) : null;
  }
  if (book === "manual") {
    const [row] = await db
      .select()
      .from(manualTrades)
      .where(and(eq(manualTrades.id, tradeId), eq(manualTrades.userId, userId)));
    return row ? convertCoreMoney(row) : null;
  }
  const [row] = await db
    .select()
    .from(notTakenTrades)
    .where(and(eq(notTakenTrades.id, tradeId), eq(notTakenTrades.userId, userId)));
  if (!row) return null;
  return {
    ...row,
    plannedEntry: toNumberOrNull(row.plannedEntry),
    plannedStop: toNumberOrNull(row.plannedStop),
    plannedTarget: toNumberOrNull(row.plannedTarget),
    hypotheticalPnlR: toNumberOrNull(row.hypotheticalPnlR),
  };
}

export async function getTradeWithAnnotation(
  db: DB,
  userId: string,
  ref: { book: TradeBook; tradeId: string },
): Promise<TradeWithAnnotation | null> {
  const trade = await loadCore(db, userId, ref.book, ref.tradeId);
  if (!trade) return null;

  const fk = BOOK_FK[ref.book];
  const [annotation] = await db
    .select()
    .from(tradeAnnotations)
    .where(and(eq(tradeAnnotations[fk], ref.tradeId), eq(tradeAnnotations.userId, userId)));

  if (!annotation) {
    return { book: ref.book, trade, annotation: null };
  }

  const emo = await db
    .select({ id: annotationEmotionalStates.emotionalStateId })
    .from(annotationEmotionalStates)
    .where(eq(annotationEmotionalStates.annotationId, annotation.id));
  const conf = await db
    .select({ id: annotationConfluences.confluenceId })
    .from(annotationConfluences)
    .where(eq(annotationConfluences.annotationId, annotation.id));

  return {
    book: ref.book,
    trade,
    annotation: {
      ...annotation,
      stopLoss: toNumberOrNull(annotation.stopLoss),
      profitTarget: toNumberOrNull(annotation.profitTarget),
      emotionalStateIds: emo.map((r) => r.id),
      confluenceIds: conf.map((r) => r.id),
    },
  };
}

// ─────────────────────────  Upsert de la anotación  ─────────────────────────

export interface UpsertAnnotationInput {
  book: TradeBook;
  tradeId: string;
  props: TradeAnnotationProps;
  /** JSON de BlockNote. Privado, nunca publicable (FR-38). */
  journalNote?: unknown;
}

/**
 * Crea o actualiza la anotación de una operación. Idempotente por (libro, tradeId).
 * Reemplaza por completo las filas de unión de estados emocionales y confluencias.
 * Transaccional.
 */
export async function upsertAnnotation(db: DB, userId: string, input: UpsertAnnotationInput) {
  const { book, tradeId, props } = input;
  const fk = BOOK_FK[book];

  await assertCatalogIdsVisible(db, emotionalStates, userId, props.emotionalStateIds);
  await assertCatalogIdsVisible(db, confluences, userId, props.confluenceIds);

  return db.transaction(async (tx) => {
    const typedColumns = {
      setupId: props.setupId ?? null,
      setupFamily: props.setupFamily ?? null,
      htfBias: props.htfBias ?? null,
      executionTimeframe: props.executionTimeframe ?? null,
      marketSession: props.marketSession ?? null,
      checklistCompliance: props.checklistCompliance ?? null,
      // Bug encontrado al reescribir este repo contra el esquema nuevo: el
      // proyecto anterior nunca escribía stopLoss/profitTarget acá pese a que
      // el esquema y `TradeAnnotationProps` ya los tenían (columnas propias,
      // no `extra`, desde el 2026-09-11 del proyecto antiguo). Corregido.
      stopLoss: toDbNumericOrNull(props.stopLoss ?? null),
      profitTarget: toDbNumericOrNull(props.profitTarget ?? null),
      extra: props.extra ?? null,
      updatedAt: new Date(),
    };

    const [existing] = await tx
      .select({ id: tradeAnnotations.id })
      .from(tradeAnnotations)
      .where(and(eq(tradeAnnotations[fk], tradeId), eq(tradeAnnotations.userId, userId)));

    let annotationId: string;
    if (existing) {
      annotationId = existing.id;
      await tx
        .update(tradeAnnotations)
        .set({
          ...typedColumns,
          ...(input.journalNote !== undefined ? { journalNote: input.journalNote } : {}),
        })
        .where(eq(tradeAnnotations.id, annotationId));
    } else {
      const [created] = await tx
        .insert(tradeAnnotations)
        .values({
          userId,
          [fk]: tradeId,
          ...typedColumns,
          journalNote: input.journalNote ?? null,
        })
        .returning({ id: tradeAnnotations.id });
      annotationId = created!.id;
    }

    await tx
      .delete(annotationEmotionalStates)
      .where(eq(annotationEmotionalStates.annotationId, annotationId));
    if (props.emotionalStateIds.length > 0) {
      await tx.insert(annotationEmotionalStates).values(
        props.emotionalStateIds.map((emotionalStateId) => ({ annotationId, emotionalStateId })),
      );
    }

    await tx.delete(annotationConfluences).where(eq(annotationConfluences.annotationId, annotationId));
    if (props.confluenceIds.length > 0) {
      await tx.insert(annotationConfluences).values(
        props.confluenceIds.map((confluenceId) => ({ annotationId, confluenceId })),
      );
    }

    return { annotationId };
  });
}

/**
 * Escribe SÓLO el `journal_note` de la anotación (crea la fila si no existe, con
 * el resto de campos a null). NO toca las propiedades tipadas ni las tablas de
 * unión — evita que un guardado del diario pise cambios de propiedades hechos en
 * paralelo. La usa `saveJournalNoteAction`.
 */
export async function updateJournalNote(
  db: DB,
  userId: string,
  input: { book: TradeBook; tradeId: string; journalNote: unknown },
): Promise<{ annotationId: string }> {
  const fk = BOOK_FK[input.book];

  const [existing] = await db
    .select({ id: tradeAnnotations.id })
    .from(tradeAnnotations)
    .where(and(eq(tradeAnnotations[fk], input.tradeId), eq(tradeAnnotations.userId, userId)));

  if (existing) {
    await db
      .update(tradeAnnotations)
      .set({ journalNote: input.journalNote ?? null, updatedAt: new Date() })
      .where(eq(tradeAnnotations.id, existing.id));
    return { annotationId: existing.id };
  }

  const [created] = await db
    .insert(tradeAnnotations)
    .values({ userId, [fk]: input.tradeId, journalNote: input.journalNote ?? null })
    .returning({ id: tradeAnnotations.id });
  return { annotationId: created!.id };
}

// ───────────────────  Anotaciones didácticas del Mentor (FR-64)  ───────────────────

/**
 * Guarda una NUEVA versión de la anotación pública de una Operación Verificada.
 * Nunca reescribe una versión anterior: cada guardado incrementa `version` para
 * que el historial de ediciones sea visible (Tech Spec §5.2, §6.4).
 *
 * Gating: sólo `users.tier = 'mentor'` (simple check de flag, sin lógica de pago).
 * La anotación jamás altera precio/volumen/tiempos/resultado (FR-9).
 */
export async function savePublicAnnotationVersion(
  db: DB,
  userId: string,
  input: { verifiedTradeId: string; body: unknown; publish: boolean },
) {
  const [user] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId));
  if (!user || user.tier !== "mentor") {
    throw new Error("Las anotaciones públicas requieren tier Mentor (FR-64).");
  }

  const [owned] = await db
    .select({ id: verifiedTrades.id })
    .from(verifiedTrades)
    .where(and(eq(verifiedTrades.id, input.verifiedTradeId), eq(verifiedTrades.userId, userId)));
  if (!owned) throw new Error("La operación verificada no existe o no es del usuario.");

  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ version: publicAnnotations.version })
      .from(publicAnnotations)
      .where(eq(publicAnnotations.verifiedTradeId, input.verifiedTradeId))
      .orderBy(desc(publicAnnotations.version))
      .limit(1);

    const nextVersion = (last?.version ?? 0) + 1;
    const [row] = await tx
      .insert(publicAnnotations)
      .values({
        userId,
        verifiedTradeId: input.verifiedTradeId,
        version: nextVersion,
        body: input.body,
        published: input.publish,
      })
      .returning();
    return row!;
  });
}

export async function getLatestPublicAnnotation(db: DB, userId: string, verifiedTradeId: string) {
  const [row] = await db
    .select()
    .from(publicAnnotations)
    .where(
      and(
        eq(publicAnnotations.verifiedTradeId, verifiedTradeId),
        eq(publicAnnotations.userId, userId),
      ),
    )
    .orderBy(desc(publicAnnotations.version))
    .limit(1);
  return row ?? null;
}

export async function listPublicAnnotationHistory(
  db: DB,
  userId: string,
  verifiedTradeId: string,
) {
  return db
    .select({
      version: publicAnnotations.version,
      published: publicAnnotations.published,
      createdAt: publicAnnotations.createdAt,
    })
    .from(publicAnnotations)
    .where(
      and(
        eq(publicAnnotations.verifiedTradeId, verifiedTradeId),
        eq(publicAnnotations.userId, userId),
      ),
    )
    .orderBy(desc(publicAnnotations.version));
}
