"use client";

import { useMemo } from "react";
import type { TradeAnnotationProps } from "@tradevision/contracts";

export interface Catalogs {
  setups: { id: string; name: string; family: string | null }[];
  emotionalStates: { id: string; label: string; scope: "global" | "custom" }[];
  confluences: { id: string; label: string; scope: "global" | "custom" }[];
}

type EnumKey = "htfBias" | "executionTimeframe" | "marketSession" | "checklistCompliance";
type NumberKey = "stopLoss" | "profitTarget";

const ENUM_OPTIONS: Record<EnumKey, [string, string][]> = {
  htfBias: [
    ["bullish", "Alcista"],
    ["bearish", "Bajista"],
    ["range", "Rango"],
    ["undefined", "Indefinido"],
  ],
  executionTimeframe: [
    ["1m", "1 min"],
    ["5m", "5 min"],
    ["15m", "15 min"],
    ["1H", "1 hora"],
    ["4H", "4 horas"],
    ["D", "Diario"],
    ["W", "Semanal"],
  ],
  marketSession: [
    ["asia", "Asia"],
    ["london", "Londres"],
    ["ny", "Nueva York"],
  ],
  checklistCompliance: [
    ["in_plan", "En plan"],
    ["out_of_plan", "Fuera de plan"],
  ],
};

const ENUM_LABEL: Record<EnumKey, string> = {
  htfBias: "Sesgo HTF",
  executionTimeframe: "Timeframe de ejecución",
  marketSession: "Sesión de mercado",
  checklistCompliance: "Cumplimiento de checklist",
};

const NUMBER_LABEL: Record<NumberKey, string> = {
  stopLoss: "Stop loss",
  profitTarget: "Objetivo (take profit)",
};

const ENUM_KEYS: EnumKey[] = ["htfBias", "executionTimeframe", "marketSession", "checklistCompliance"];
const NUMBER_KEYS: NumberKey[] = ["stopLoss", "profitTarget"];

/**
 * Hoja de propiedades tipadas (registro tipo Notion). Controlado: el padre
 * (`AnnotationWorkspace`) posee el estado y el autoguardado — este componente
 * sólo renderiza y emite `onChange`. Un único renderer para los 4 selects de
 * enum + 2 numéricos evita la duplicación campo a campo del proyecto anterior.
 */
export function PropertiesPanel({
  value,
  onChange,
  catalogs,
}: {
  value: TradeAnnotationProps;
  onChange: (next: TradeAnnotationProps) => void;
  catalogs: Catalogs;
}) {
  const families = useMemo(() => {
    const set = new Set<string>();
    for (const s of catalogs.setups) if (s.family) set.add(s.family);
    return [...set].sort();
  }, [catalogs.setups]);

  function set<K extends keyof TradeAnnotationProps>(key: K, v: TradeAnnotationProps[K]) {
    onChange({ ...value, [key]: v });
  }

  function toggleId(key: "confluenceIds" | "emotionalStateIds", id: string) {
    const current = value[key];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    set(key, next);
  }

  return (
    <div className="tv-props-grid">
      <div className="tv-props">
        <label className="tv-field">
          <span>Setup</span>
          <select
            value={value.setupId ?? ""}
            onChange={(e) => set("setupId", e.target.value || undefined)}
          >
            <option value="">—</option>
            {catalogs.setups.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="tv-field">
          <span>Familia / estilo</span>
          <input
            list="tv-families"
            value={value.setupFamily ?? ""}
            onChange={(e) => set("setupFamily", e.target.value || undefined)}
            placeholder="p. ej. SMC, ICT…"
          />
          <datalist id="tv-families">
            {families.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>

        {ENUM_KEYS.map((key) => (
          <label className="tv-field" key={key}>
            <span>{ENUM_LABEL[key]}</span>
            <select
              value={value[key] ?? ""}
              onChange={(e) => set(key, (e.target.value || undefined) as TradeAnnotationProps[EnumKey])}
            >
              <option value="">—</option>
              {ENUM_OPTIONS[key].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {NUMBER_KEYS.map((key) => (
          <label className="tv-field" key={key}>
            <span>{NUMBER_LABEL[key]}</span>
            <input
              type="number"
              step="any"
              value={value[key] ?? ""}
              onChange={(e) => set(key, e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="tv-subgroup-title">Confluencias vistas</div>
      <div className="tv-chip-set">
        {catalogs.confluences.map((c) => (
          <label key={c.id} className="tv-chip" data-on={value.confluenceIds.includes(c.id)}>
            <input
              type="checkbox"
              checked={value.confluenceIds.includes(c.id)}
              onChange={() => toggleId("confluenceIds", c.id)}
            />
            {c.label}
          </label>
        ))}
      </div>

      <div className="tv-subgroup-title">Estado emocional — privado, nunca se publica (FR-38)</div>
      <div className="tv-chip-set">
        {catalogs.emotionalStates.map((c) => (
          <label key={c.id} className="tv-chip" data-on={value.emotionalStateIds.includes(c.id)}>
            <input
              type="checkbox"
              checked={value.emotionalStateIds.includes(c.id)}
              onChange={() => toggleId("emotionalStateIds", c.id)}
            />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}
