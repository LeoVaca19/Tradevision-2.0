"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { TradeBook } from "@/lib/trade-view";
import { saveJournalNoteAction } from "@/app/trades/actions";

const AUTOSAVE_MS = 1200;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

type Status = "idle" | "saving" | "saved" | "error";

async function uploadFile(file: File): Promise<string> {
  if (!ACCEPTED_MIME.has(file.type)) throw new Error("Formato no admitido (usa PNG, JPEG o WebP).");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("La imagen supera los 10 MB.");

  const presign = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mime: file.type, size: file.size }),
  });
  if (!presign.ok) throw new Error("No se pudo iniciar la subida.");
  const { uploadUrl, key } = (await presign.json()) as { uploadUrl: string; key: string };

  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error("La subida de la imagen falló.");

  return `/api/uploads/${key}`;
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
}: {
  book: TradeBook;
  tradeId: string;
  initialContent: PartialBlock[] | undefined;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote({ initialContent, dictionary: es, uploadFile });

  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => {
      saveJournalNoteAction({ book, tradeId, journalNote: editor.document })
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, AUTOSAVE_MS);
  }

  return (
    <div>
      <p className="tv-editor-status" data-status={status}>
        {status === "idle" && "Diario privado — nunca se publica."}
        {status === "saving" && "Guardando…"}
        {status === "saved" && "Guardado."}
        {status === "error" && "Error al guardar — reintentá."}
      </p>
      <div className="tv-section-editor">
        <BlockNoteView editor={editor} theme="light" onChange={scheduleSave} />
      </div>
    </div>
  );
}
