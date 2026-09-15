"use client";

import { useEffect, useState } from "react";
import { TradeCardGrid, type CardTrade } from "./TradeCardGrid";
import { TradeLogTable } from "./TradeLogTable";

type View = "gallery" | "table";
const STORAGE_KEY = "tv-trades-registry-view";

/**
 * Toggle Galería/Tabla. Preferencia puramente de navegador (localStorage) —
 * no es un campo del usuario ni un parámetro de URL, sólo una comodidad de
 * visualización que no necesita sobrevivir fuera de este dispositivo.
 */
export function TradeRegistryView({ trades }: { trades: readonly CardTrade[] }) {
  const [view, setView] = useState<View>("gallery");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "gallery" || saved === "table") setView(saved);
    } catch {
      // localStorage no disponible (privado/cuota) — se queda en "gallery".
    }
  }, []);

  function choose(next: View) {
    setView(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort, sin bloquear la UI
    }
  }

  return (
    <div>
      <div className="tv-seg" role="tablist" aria-label="Vista del registro">
        <button type="button" className="tv-seg-btn" data-on={view === "gallery"} onClick={() => choose("gallery")}>
          Galería
        </button>
        <button type="button" className="tv-seg-btn" data-on={view === "table"} onClick={() => choose("table")}>
          Tabla
        </button>
      </div>
      <div style={{ marginTop: 16 }}>
        {view === "gallery" ? <TradeCardGrid trades={trades} /> : <TradeLogTable trades={trades} />}
      </div>
    </div>
  );
}
