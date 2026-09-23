"use client";

import { useActionState } from "react";
import { createManualTradeAction } from "@/app/trades/actions";

type FormState = { ok: true } | { ok: false; error: string };
const initialState: FormState = { ok: true };

const DECIMAL_FIELDS = ["volume", "entryPrice", "exitPrice", "pnlCurrency", "pnlR"] as const;
const UNSIGNED_PATTERN = "[0-9]*[.,]?[0-9]+";
const SIGNED_PATTERN = "-?[0-9]*[.,]?[0-9]+";
const DECIMAL_HINT = "Número con coma o punto decimal, p. ej. 2,5 o 2.5";

/** `type="number"` de Chrome bloquea la coma; se usa texto y se normaliza acá, antes de la Server Action. */
function normalizeDecimals(formData: FormData) {
  for (const name of DECIMAL_FIELDS) {
    const raw = formData.get(name);
    if (typeof raw === "string") formData.set(name, raw.trim().replace(",", "."));
  }
  return formData;
}

/**
 * Alta manual (Libro Manual, FR-10: `verified` siempre falso). Formulario no
 * controlado sobre `useActionState` — validación Zod y `redirect()` viven en
 * la Server Action, no acá.
 */
export function NewManualTradeForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createManualTradeAction, initialState);

  return (
    <form action={(formData) => formAction(normalizeDecimals(formData))} className="tv-form">
      {"error" in state && state.error ? (
        <p className="tv-form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="tv-form-row">
        <label className="tv-field">
          <span>Instrumento</span>
          <input name="instrument" required placeholder="EURUSD" />
        </label>
        <label className="tv-field">
          <span>Lado</span>
          <select name="side" defaultValue="long">
            <option value="long">Largo</option>
            <option value="short">Corto</option>
          </select>
        </label>
        <label className="tv-field">
          <span>Lotaje / contratos</span>
          <input name="volume" type="text" inputMode="decimal" pattern={UNSIGNED_PATTERN} title={DECIMAL_HINT} required />
        </label>
      </div>

      <div className="tv-form-row">
        <label className="tv-field">
          <span>Precio de entrada</span>
          <input name="entryPrice" type="text" inputMode="decimal" pattern={UNSIGNED_PATTERN} title={DECIMAL_HINT} required />
        </label>
        <label className="tv-field">
          <span>Precio de salida</span>
          <input name="exitPrice" type="text" inputMode="decimal" pattern={UNSIGNED_PATTERN} title={DECIMAL_HINT} required />
        </label>
      </div>

      <div className="tv-form-row">
        <label className="tv-field">
          <span>Apertura</span>
          <input name="openedAt" type="datetime-local" required />
        </label>
        <label className="tv-field">
          <span>Cierre</span>
          <input name="closedAt" type="datetime-local" required />
        </label>
      </div>

      <div className="tv-form-row">
        <label className="tv-field">
          <span>P&amp;L en divisa</span>
          <input name="pnlCurrency" type="text" inputMode="decimal" pattern={SIGNED_PATTERN} title={DECIMAL_HINT} required />
        </label>
        <label className="tv-field">
          <span>Resultado en R (opcional)</span>
          <input name="pnlR" type="text" inputMode="decimal" pattern={SIGNED_PATTERN} title={DECIMAL_HINT} />
        </label>
      </div>

      <p>
        <button type="submit" className="tv-btn" disabled={pending}>
          {pending ? "Guardando…" : "Registrar operación"}
        </button>
      </p>
      <p className="tv-sample">
        Esta operación queda en el Libro Manual: Declarada, nunca lleva Sello (FR-10).
      </p>
    </form>
  );
}
