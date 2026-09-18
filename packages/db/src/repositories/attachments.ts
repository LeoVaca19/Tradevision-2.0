import { and, asc, eq, sql } from "drizzle-orm";
import type { DB } from "../client.js";
import { tradeAnnotations, tradeAttachments } from "../schema.js";
import { BOOK_FK, type TradeBook } from "./trades.js";

/**
 * Capturas de gráfico (Tech Spec §6.1 / §4.6 Cambio 3, `trade_attachments`).
 * Enlazadas a la ANOTACIÓN de la operación, nunca a la operación núcleo — FR-9:
 * son enriquecimiento del usuario, jamás tocan precio/volumen/tiempos/resultado.
 *
 * `POST /api/uploads` + `PUT` al storage ya suben el fichero real (Bloque 8);
 * este módulo sólo registra qué `key` quedó asociada a qué operación, con el
 * límite de 3 forzado acá (no confiar sólo en el frontend).
 */

export const MAX_ATTACHMENTS_PER_TRADE = 3;

export interface AttachmentInput {
  book: TradeBook;
  tradeId: string;
  /** Clave en el storage (R2/Supabase Storage) devuelta por `POST /api/uploads`. */
  key: string;
  thumbKey?: string | null;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
}

export interface Attachment {
  id: string;
  annotationId: string;
  key: string;
  thumbKey: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

/** Resuelve el annotationId existente de (book, tradeId) para userId, o null si no hay anotación. */
async function findAnnotationId(db: DB, userId: string, book: TradeBook, tradeId: string): Promise<string | null> {
  const fk = BOOK_FK[book];
  const [row] = await db
    .select({ id: tradeAnnotations.id })
    .from(tradeAnnotations)
    .where(and(eq(tradeAnnotations[fk], tradeId), eq(tradeAnnotations.userId, userId)));
  return row?.id ?? null;
}

/**
 * Registra un adjunto ya subido. Si la operación todavía no tiene anotación
 * (p. ej. primera acción del usuario en una ficha recién creada, antes de que
 * `upsertAnnotation` corra) crea una vacía — mismo criterio que
 * `updateJournalNote` para el diario. Transaccional: el conteo del límite de
 * 3 y el insert corren juntos para no dejar pasar una carrera entre dos
 * subidas casi simultáneas.
 */
export async function createAttachment(db: DB, userId: string, input: AttachmentInput): Promise<Attachment> {
  const fk = BOOK_FK[input.book];

  return db.transaction(async (tx) => {
    const [existingAnnotation] = await tx
      .select({ id: tradeAnnotations.id })
      .from(tradeAnnotations)
      .where(and(eq(tradeAnnotations[fk], input.tradeId), eq(tradeAnnotations.userId, userId)));

    let annotationId: string;
    if (existingAnnotation) {
      annotationId = existingAnnotation.id;
    } else {
      const [created] = await tx
        .insert(tradeAnnotations)
        .values({ userId, [fk]: input.tradeId })
        .returning({ id: tradeAnnotations.id });
      annotationId = created!.id;
    }

    const [countRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tradeAttachments)
      .where(eq(tradeAttachments.annotationId, annotationId));
    if ((countRow?.n ?? 0) >= MAX_ATTACHMENTS_PER_TRADE) {
      throw new Error(`Máximo ${MAX_ATTACHMENTS_PER_TRADE} capturas por operación.`);
    }

    const [row] = await tx
      .insert(tradeAttachments)
      .values({
        annotationId,
        key: input.key,
        thumbKey: input.thumbKey ?? null,
        mime: input.mime,
        size: input.size,
        width: input.width ?? null,
        height: input.height ?? null,
      })
      .returning();
    return row!;
  });
}

export async function listAttachments(
  db: DB,
  userId: string,
  ref: { book: TradeBook; tradeId: string },
): Promise<Attachment[]> {
  const annotationId = await findAnnotationId(db, userId, ref.book, ref.tradeId);
  if (!annotationId) return [];
  return db
    .select()
    .from(tradeAttachments)
    .where(eq(tradeAttachments.annotationId, annotationId))
    .orderBy(asc(tradeAttachments.createdAt));
}

/**
 * Borra un adjunto propio. `trade_attachments` no tiene `userId` propio —
 * la propiedad se verifica por join a `trade_annotations`. No borra el
 * objeto del storage (R2/Supabase Storage); eso es responsabilidad de quien
 * llame (o un job de limpieza aparte), igual que el resto de esta capa nunca
 * hizo I/O de storage directamente.
 */
export async function deleteAttachment(db: DB, userId: string, id: string): Promise<void> {
  const [owned] = await db
    .select({ id: tradeAttachments.id })
    .from(tradeAttachments)
    .innerJoin(tradeAnnotations, eq(tradeAnnotations.id, tradeAttachments.annotationId))
    .where(and(eq(tradeAttachments.id, id), eq(tradeAnnotations.userId, userId)));
  if (!owned) throw new Error("El adjunto no existe o no es del usuario.");

  await db.delete(tradeAttachments).where(eq(tradeAttachments.id, id));
}
