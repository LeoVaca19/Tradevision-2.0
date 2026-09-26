"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PartialBlock } from "@blocknote/core";
import type { TradeAnnotationProps } from "@tradevision/contracts";
import type { TradeAttachment } from "@/lib/data";
import type { TradeBook } from "@/lib/trade-view";
import { saveAnnotationAction } from "@/app/trades/actions";
import { useAutosave } from "@/lib/use-autosave";
import { PropertiesPanel, type Catalogs } from "./PropertiesPanel";
import { JournalEditorClient, PublicAnnotationEditorClient } from "./EditorsClient";
import { TradeAttachments } from "./TradeAttachments";

const AUTOSAVE_MS = 900;

/**
 * Orquestador de la ficha: propiedades + diario + (si aplica) anotación
 * pública. Dos ciclos de autoguardado DESACOPLADOS a propósito:
 *  - `props` (esta capa) → debounce propio → `saveAnnotationAction`.
 *  - el diario tiene el suyo dentro de `JournalEditorClient`
 *    (`saveJournalNoteAction`, que sólo toca `journal_note`).
 * Así ninguno de los dos pisa cambios en paralelo del otro (FR-9).
 * "Listo" fuerza ambos guardados pendientes y recién entonces vuelve al Diario.
 */
export function AnnotationWorkspace({
  book,
  tradeId,
  initial,
  journalInitial,
  catalogs,
  attachments,
  maxAttachments,
  showPublicAnnotation,
}: {
  book: TradeBook;
  tradeId: string;
  initial: TradeAnnotationProps;
  journalInitial: PartialBlock[] | undefined;
  catalogs: Catalogs;
  attachments: TradeAttachment[];
  maxAttachments: number;
  showPublicAnnotation: boolean;
}) {
  const router = useRouter();
  const [props, setProps] = useState(initial);
  const propsRef = useRef(initial);
  const journalFlush = useRef<(() => Promise<boolean>) | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);

  const { status, schedule, flush: flushProps } = useAutosave(
    () => saveAnnotationAction({ book, tradeId, props: propsRef.current }),
    AUTOSAVE_MS,
  );

  function persist(next: TradeAnnotationProps) {
    propsRef.current = next;
    setProps(next);
    schedule();
  }

  async function done() {
    setFinishing(true);
    setFinishError(false);
    const [propsOk, journalOk] = await Promise.all([flushProps(), journalFlush.current?.() ?? true]);
    if (propsOk && journalOk) {
      router.push("/trades");
    } else {
      setFinishing(false);
      setFinishError(true);
    }
  }

  return (
    <div className="tv-workspace">
      <div className="tv-workspace-bar">
        <h2 className="tv-section-title" style={{ margin: 0 }}>
          Propiedades
        </h2>
        <span className="tv-workspace-status" data-status={status}>
          {status === "idle" && "Sin cambios"}
          {status === "saving" && "Guardando…"}
          {status === "saved" && "Guardado"}
          {status === "error" && "Error al guardar"}
        </span>
      </div>

      <div className="tv-card">
        <PropertiesPanel value={props} onChange={persist} catalogs={catalogs} />
      </div>

      <div className="tv-card">
        <h2 className="tv-section-title">Capturas</h2>
        <TradeAttachments book={book} tradeId={tradeId} initial={attachments} max={maxAttachments} />
      </div>

      <div className="tv-card">
        <h2 className="tv-section-title">Diario</h2>
        <JournalEditorClient book={book} tradeId={tradeId} initialContent={journalInitial} flushRef={journalFlush} />
      </div>

      {showPublicAnnotation ? (
        <div className="tv-card">
          <h2 className="tv-section-title">Anotación pública</h2>
          <p className="tv-sample" style={{ marginBottom: 12 }}>
            Visible en tu Perfil Público, sujeta a la Ventana de Retardo. Cada guardado crea
            una versión nueva; nunca reescribe la anterior.
          </p>
          <PublicAnnotationEditorClient tradeId={tradeId} />
        </div>
      ) : null}

      <div className="tv-workspace-done">
        <button type="button" className="tv-btn" onClick={() => void done()} disabled={finishing}>
          {finishing ? "Guardando…" : "Listo"}
        </button>
        {finishError ? (
          <p className="tv-editor-status" data-status="error" role="alert">
            No se pudo guardar todo. Reintentá antes de salir.
          </p>
        ) : null}
      </div>
    </div>
  );
}
