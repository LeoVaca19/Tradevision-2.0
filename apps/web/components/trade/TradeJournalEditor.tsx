"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect } from "react";
import type { PartialBlock } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { TradeBook } from "@/lib/trade-view";
import { saveJournalNoteAction } from "@/app/trades/actions";
import { useAutosave } from "@/lib/use-autosave";
import { imageUrl, uploadImage } from "@/lib/upload-image";

const AUTOSAVE_MS = 1200;

/** El editor embebe la imagen por URL: se sube y se devuelve la URL de lectura (key codificada). */
async function uploadFile(file: File): Promise<string> {
  return imageUrl(await uploadImage(file));
}

/**
 * Diario privado de la operación — nunca se publica. Autoguardado propio,
 * DESACOPLADO del guardado de propiedades (`AnnotationWorkspace`): el
 * servidor sólo toca `journal_note` (ver `app/trades/actions.ts`), así el
 * autoguardado del diario nunca pisa cambios en paralelo del panel.
 */
export function TradeJournalEditor({
  book,
  tradeId,
  initialContent,
  flushRef,
}: {
  book: TradeBook;
  tradeId: string;
  initialContent: PartialBlock[] | undefined;
  /** El padre lee `flushRef.current()` para forzar el guardado pendiente (botón "Listo"). */
  flushRef?: { current: (() => Promise<boolean>) | null };
}) {
  const editor = useCreateBlockNote({ initialContent, dictionary: es, uploadFile });

  const { status, schedule, flush } = useAutosave(
    () => saveJournalNoteAction({ book, tradeId, journalNote: editor.document }),
    AUTOSAVE_MS,
  );

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  });

  return (
    <div>
      <p className="tv-editor-status" data-status={status}>
        {status === "idle" && "Diario privado — nunca se publica."}
        {status === "saving" && "Guardando…"}
        {status === "saved" && "Guardado."}
        {status === "error" && "Error al guardar — reintentá."}
      </p>
      <div className="tv-section-editor">
        <BlockNoteView editor={editor} theme="light" onChange={schedule} />
      </div>
    </div>
  );
}
