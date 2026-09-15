"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TradeAnnotationProps } from "@tradevision/contracts";
import * as data from "@/lib/data";

const TradeBook = z.enum(["verified", "manual", "not_taken"]);

const ManualTradeForm = z
  .object({
    instrument: z.string().min(1, "instrumento requerido"),
    side: z.enum(["long", "short"]),
    volume: z.coerce.number().positive(),
    entryPrice: z.coerce.number().positive(),
    exitPrice: z.coerce.number().positive(),
    openedAt: z.string().min(1),
    closedAt: z.string().min(1),
    commission: z.coerce.number().default(0),
    swap: z.coerce.number().default(0),
    pnlCurrency: z.coerce.number(),
    pnlR: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v == null ? null : Number(v))),
  })
  .refine((v) => new Date(v.closedAt) >= new Date(v.openedAt), {
    message: "el cierre no puede ser anterior a la apertura",
    path: ["closedAt"],
  });

export async function createManualTradeAction(_prev: unknown, formData: FormData) {
  const parsed = ManualTradeForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join(" · ") };
  }
  const d = parsed.data;
  const trade = await data.createManualTrade({
    instrument: d.instrument,
    side: d.side,
    volume: d.volume,
    entryPrice: d.entryPrice,
    exitPrice: d.exitPrice,
    openedAt: new Date(d.openedAt),
    closedAt: new Date(d.closedAt),
    commission: d.commission,
    swap: d.swap,
    pnlCurrency: d.pnlCurrency,
    pnlR: d.pnlR,
  });
  redirect(`/trades/manual/${trade.id}`);
}

const SaveAnnotationInput = z.object({
  book: TradeBook,
  tradeId: z.string().uuid(),
  props: TradeAnnotationProps,
});

export async function saveAnnotationAction(input: z.infer<typeof SaveAnnotationInput>) {
  const { book, tradeId, props } = SaveAnnotationInput.parse(input);
  await data.upsertAnnotation({ book, tradeId, props });
  revalidatePath(`/trades/${book}/${tradeId}`);
  return { ok: true as const };
}

// CONTRATO: la acción sólo usa { book, tradeId, journalNote }. El servidor NO
// mira `props` — así el autoguardado del diario nunca pisa cambios de
// propiedades hechos en el panel en paralelo (regla heredada, mismo bug que
// el proyecto anterior corrigió el 2026-09-08 y que este repo nunca
// reintroduce). `props` sigue aceptándose y se IGNORA para no romper llamadas
// existentes del frontend; se puede quitar de la llamada en
// `TradeJournalEditor.tsx` cuando se construya en el Bloque 9.
const SaveJournalInput = z.object({
  book: TradeBook,
  tradeId: z.string().uuid(),
  journalNote: z.unknown(),
  props: z.unknown().optional(),
});

export async function saveJournalNoteAction(input: z.infer<typeof SaveJournalInput>) {
  const { book, tradeId, journalNote } = SaveJournalInput.parse(input);
  await data.saveJournalNote({ book, tradeId, journalNote });
  return { ok: true as const };
}

const PublicAnnotationInput = z.object({
  verifiedTradeId: z.string().uuid(),
  body: z.unknown(),
  publish: z.boolean(),
});

export async function savePublicAnnotationAction(input: z.infer<typeof PublicAnnotationInput>) {
  const user = await data.currentUser();
  if (user.tier !== "mentor") {
    return { ok: false as const, error: "Requiere tier Mentor (FR-64)." };
  }
  const { verifiedTradeId, body, publish } = PublicAnnotationInput.parse(input);
  const row = await data.savePublicAnnotation({ verifiedTradeId, body, publish });
  revalidatePath(`/trades/verified/${verifiedTradeId}`);
  return { ok: true as const, version: row.version, published: row.published };
}

export async function loadPublicAnnotationAction(verifiedTradeId: string) {
  return data.getLatestPublicAnnotation(verifiedTradeId);
}

export async function createSetupAction(name: string, family?: string) {
  const row = await data.createSetup(name, family || null);
  revalidatePath("/trades");
  return row;
}

export async function createConfluenceAction(label: string) {
  return data.createConfluence(label);
}

export async function createEmotionalStateAction(label: string) {
  return data.createEmotionalState(label);
}

export async function createTradingAccountAction(input: {
  name: string;
  kind: "broker_synced" | "manual";
  profitCalcMethod?: "fifo" | "lifo" | "wavg";
  currency?: string;
  initialBalance?: number | null;
}) {
  return data.createTradingAccount(input);
}
