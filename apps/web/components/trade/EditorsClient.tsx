"use client";

import dynamic from "next/dynamic";
import type { PartialBlock } from "@blocknote/core";
import type { TradeBook } from "@/lib/trade-view";

/**
 * Único punto de carga de los editores BlockNote. BlockNote toca `window` al
 * construir la instancia — nunca puede ejecutarse en SSR, y `next/dynamic`
 * con `ssr:false` sólo se puede llamar desde un módulo "use client". Los
 * consumidores (AnnotationWorkspace, la ficha del trade) importan SIEMPRE
 * desde acá, nunca los componentes de editor directamente.
 */
const Journal = dynamic(() => import("./TradeJournalEditor").then((m) => m.TradeJournalEditor), {
  ssr: false,
  loading: () => <p className="tv-sample">Cargando editor…</p>,
});

const PublicAnnotation = dynamic(() => import("./PublicAnnotationEditor").then((m) => m.PublicAnnotationEditor), {
  ssr: false,
  loading: () => <p className="tv-sample">Cargando editor…</p>,
});

export function JournalEditorClient(props: {
  book: TradeBook;
  tradeId: string;
  initialContent: PartialBlock[] | undefined;
}) {
  return <Journal {...props} />;
}

export function PublicAnnotationEditorClient(props: { tradeId: string }) {
  return <PublicAnnotation {...props} />;
}
