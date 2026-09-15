"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { loadPublicAnnotationAction, savePublicAnnotationAction } from "@/app/trades/actions";

type Status = "idle" | "saving" | "saved" | "error";
type Meta = { version: number; published: boolean };

/**
 * Anotación pública (FR-64, tier Mentor) sobre una operación del Libro
 * Verificado. Distinta del diario privado: sin autoguardado, cada guardado
 * crea una VERSIÓN nueva, nunca reescribe la anterior.
 */
export function PublicAnnotationEditor({ tradeId }: { tradeId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [initial, setInitial] = useState<PartialBlock[] | undefined>(undefined);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPublicAnnotationAction(tradeId)
      .then((row) => {
        if (cancelled) return;
        if (row && Array.isArray(row.body) && row.body.length > 0) {
          setInitial(row.body as PartialBlock[]);
          setMeta({ version: row.version, published: row.published });
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  if (!loaded) return <p className="tv-sample">Cargando…</p>;

  return <PublicAnnotationEditorInner tradeId={tradeId} initial={initial} initialMeta={meta} />;
}

function PublicAnnotationEditorInner({
  tradeId,
  initial,
  initialMeta,
}: {
  tradeId: string;
  initial: PartialBlock[] | undefined;
  initialMeta: Meta | null;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [meta, setMeta] = useState<Meta | null>(initialMeta);
  const editor = useCreateBlockNote({ initialContent: initial, dictionary: es });

  async function save(publish: boolean) {
    setStatus("saving");
    const result = await savePublicAnnotationAction({
      verifiedTradeId: tradeId,
      body: editor.document,
      publish,
    });
    if (result.ok) {
      setMeta({ version: result.version, published: result.published });
      setStatus("saved");
    } else {
      setStatus("error");
    }
  }

  return (
    <div>
      <p className="tv-editor-status" data-status={status}>
        {meta ? `v${meta.version} · ${meta.published ? "publicada" : "borrador"}` : "Sin publicar todavía"}
        {status === "saving" && " · guardando…"}
        {status === "error" && " · error al guardar"}
      </p>
      <div className="tv-section-editor">
        <BlockNoteView editor={editor} theme="light" />
      </div>
      <div className="tv-annotation-actions">
        <button type="button" className="tv-btn tv-btn-ghost" onClick={() => save(false)} disabled={status === "saving"}>
          Guardar borrador
        </button>
        <button type="button" className="tv-btn" onClick={() => save(true)} disabled={status === "saving"}>
          Guardar y publicar
        </button>
      </div>
    </div>
  );
}
