import { STATE_DESCRIPTORS, type VerificationState } from "@tradevision/design-system";

/**
 * Estado de una cifra: color + icono + texto (FR-13). Nunca solo color.
 */
export function StatBadge({ state }: { state: VerificationState }) {
  const d = STATE_DESCRIPTORS[state];
  return (
    <span className="tv-badge" data-state={state} title={d.description}>
      <span aria-hidden>{d.icon}</span>
      {d.label}
    </span>
  );
}
