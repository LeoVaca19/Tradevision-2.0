"use client";

import { useActionState, useState } from "react";
import { authAction, type AuthState } from "@/app/login/actions";

/** Alterna "Iniciar sesión" / "Crear cuenta" sobre dos Server Actions. */
export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(authAction, {});

  return (
    <form action={formAction} className="tv-form">
      {state.error ? (
        <p className="tv-form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.info ? <p role="status">{state.info}</p> : null}

      <input type="hidden" name="mode" value={mode} />
      <label className="tv-field">
        <span>Correo</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label className="tv-field">
        <span>Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={6}
          required
        />
      </label>

      <button type="submit" className="tv-btn" disabled={pending}>
        {pending ? "…" : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
      </button>
      <button type="button" className="tv-btn tv-btn-ghost" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "¿No tienes cuenta? Crear cuenta" : "¿Ya tienes cuenta? Iniciar sesión"}
      </button>
    </form>
  );
}
