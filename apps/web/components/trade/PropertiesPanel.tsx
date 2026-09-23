"use client";

import { useMemo, useState } from "react";
import type { TradeAnnotationProps } from "@tradevision/contracts";
import { createConfluenceAction, createEmotionalStateAction } from "@/app/trades/actions";
import { DecimalInput } from "./DecimalInput";

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

const NUMBER_HINT = "Distancia en puntos desde la entrada, no precio absoluto.";

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
            <DecimalInput
              value={value[key]}
              placeholder="Distancia en puntos"
              onChange={(n) => set(key, n)}
            />
            <small className="tv-sample" style={{ marginTop: 0 }}>
              {NUMBER_HINT}
            </small>
          </label>
        ))}
      </div>

      <div className="tv-subgroup-title">Confluencias vistas</div>
      <CatalogChips
        initialItems={catalogs.confluences}
        selectedIds={value.confluenceIds}
        onToggle={(id) => toggleId("confluenceIds", id)}
        onCreated={(id) => set("confluenceIds", [...value.confluenceIds, id])}
        create={createConfluenceAction}
        addLabel="Agregar confluencia"
      />

      <div className="tv-subgroup-title">Estado emocional — privado, nunca se publica (FR-38)</div>
      <CatalogChips
        initialItems={catalogs.emotionalStates}
        selectedIds={value.emotionalStateIds}
        onToggle={(id) => toggleId("emotionalStateIds", id)}
        onCreated={(id) => set("emotionalStateIds", [...value.emotionalStateIds, id])}
        create={createEmotionalStateAction}
        addLabel="Agregar estado emocional"
      />
    </div>
  );
}

type CatalogItem = Catalogs["confluences"][number];

/**
 * Chips de catálogo (confluencias / estados emocionales) + campo de texto libre
 * para crear uno propio. Al confirmar llama a la Server Action, agrega el chip
 * y lo deja seleccionado en esta operación. Si el nombre ya existe (sin
 * distinguir mayúsculas) no se crea uno duplicado: se selecciona el existente.
 */
function CatalogChips({
  initialItems,
  selectedIds,
  onToggle,
  onCreated,
  create,
  addLabel,
}: {
  initialItems: CatalogItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onCreated: (id: string) => void;
  create: (label: string) => Promise<{ id: string; label: string } | null>;
  addLabel: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const label = text.trim();
    if (!label || pending) return;
    setError(null);

    const existing = items.find((i) => i.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      if (!selectedIds.includes(existing.id)) onToggle(existing.id);
      setText("");
      return;
    }

    setPending(true);
    try {
      const row = await create(label);
      if (!row) {
        setError("No se pudo crear (¿ya existe con ese nombre?).");
        return;
      }
      setItems((prev) => [...prev, { id: row.id, label: row.label, scope: "custom" }]);
      onCreated(row.id);
      setText("");
    } catch {
      setError("No se pudo crear. Reintentá.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="tv-chip-set">
        {items.map((c) => (
          <label key={c.id} className="tv-chip" data-on={selectedIds.includes(c.id)}>
            <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => onToggle(c.id)} />
            {c.label}
          </label>
        ))}
      </div>
      <div className="tv-chip-add">
        <input
          value={text}
          maxLength={64}
          placeholder={`${addLabel}…`}
          aria-label={addLabel}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" className="tv-btn tv-btn-ghost tv-btn-sm" onClick={() => void add()} disabled={pending || !text.trim()}>
          {pending ? "Agregando…" : "+ Agregar"}
        </button>
      </div>
      {error ? (
        <p className="tv-editor-status" data-status="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
