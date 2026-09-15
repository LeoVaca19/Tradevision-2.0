"use client";

import { useRef, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import type { TradeAnnotationProps } from "@tradevision/contracts";
import type { TradeBook } from "@/lib/trade-view";
import { saveAnnotationAction } from "@/app/trades/actions";
import { PropertiesPanel, type Catalogs } from "./PropertiesPanel";
import { JournalEditorClient, PublicAnnotationEditorClient } from "./EditorsClient";

const AUTOSAVE_MS = 900;
type Status = "idle" | "saving" | "saved" | "error";

/**
 * Orquestador de la ficha: propiedades + diario + (si aplica) anotación
 * pública. Dos ciclos de autoguardado DESACOPLADOS a propósito:
 *  - `props` (esta capa) → debounce propio → `saveAnnotationAction`.
 *  - el diario tiene el suyo dentro de `JournalEditorClient`
 *    (`saveJournalNoteAction`, que sólo toca `journal_note`).
 * Así ninguno de los dos pisa cambios en paralelo del otro (FR-9).
 */
export function AnnotationWorkspace({
  book,
  tradeId,
  initial,
  journalInitial,
  catalogs,
  showPublicAnnotation,
}: {
  book: TradeBook;
  tradeId: string;
  initial: TradeAnnotationProps;
  journalInitial: PartialBlock[] | undefined;
  catalogs: Catalogs;
  showPublicAnnotation: boolean;
}) {
  const [props, setProps] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(next: TradeAnnotationProps) {
    setProps(next);
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => {
      saveAnnotationAction({ book, tradeId, props: next })
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, AUTOSAVE_MS);
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
        <h2 className="tv-section-title">Diario</h2>
        <JournalEditorClient book={book} tradeId={tradeId} initialContent={journalInitial} />
      </div>

      {showPublicAnnotation ? (
        <div className="tv-card">
          <h2 className="tv-section-title">Anotación pública</h2>
          <p className="tv-sample" style={{ marginBottom: 12 }}>
            Visible en tu Perfil Público, sujeta a la Ventana de Retardo (FR-64). Cada guardado crea
            una versión nueva; nunca reescribe la anterior.
          </p>
          <PublicAnnotationEditorClient tradeId={tradeId} />
        </div>
      ) : null}
    </div>
  );
}
