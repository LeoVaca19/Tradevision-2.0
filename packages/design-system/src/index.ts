/**
 * Descriptores de estado de verificación (FR-13). Cada estado se representa
 * SIEMPRE con color + icono + texto — nunca sólo color.
 *
 * Los primitivos de UI (`<StatBadge>`, `<VerificationSeal>`, `<SampleSizeHint>`,
 * `<RadarChart>`, `<ForensicFilterBar>`) viven en `apps/web` y consumen estos
 * descriptores + los tokens CSS de `tokens.css`.
 */

export type VerificationState = "verified" | "declared" | "stale" | "revoked" | "insufficient";

export interface StateDescriptor {
  /** Prefijo de las CSS custom properties: `--state-<token>`, `-fg`, `-bg`. */
  token: VerificationState;
  /** Etiqueta corta para el badge. */
  label: string;
  /** Glifo accesible (se acompaña SIEMPRE de `label`, nunca va solo). */
  icon: string;
  /** Texto de ayuda / tooltip. */
  description: string;
}

export const STATE_DESCRIPTORS: Record<VerificationState, StateDescriptor> = {
  verified: {
    token: "verified",
    label: "Verificado",
    icon: "✔",
    description: "Dato sincronizado desde el bróker. Inmutable y con Sello.",
  },
  declared: {
    token: "declared",
    label: "Declarado",
    icon: "○",
    description: "Dato aportado por el usuario. Sin verificar, nunca lleva Sello.",
  },
  stale: {
    token: "stale",
    label: "Desactualizado",
    icon: "↻",
    description: "La cuenta lleva tiempo sin sincronizar; la cifra puede haber cambiado.",
  },
  revoked: {
    token: "revoked",
    label: "Revocado",
    icon: "✕",
    description: "La verificación se retiró (cuenta desconectada o inconsistencia detectada).",
  },
  insufficient: {
    token: "insufficient",
    label: "Datos insuficientes",
    icon: "—",
    description: "Menos de 30 operaciones: no se muestra un número (FR-14 / FR-29).",
  },
};

export const MIN_SAMPLE_SIZE = 30;

/** Referencia de tokens de gráfico, para pasar a la guía de dataviz. */
export const SERIES_TOKENS = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
  "--series-6",
] as const;
