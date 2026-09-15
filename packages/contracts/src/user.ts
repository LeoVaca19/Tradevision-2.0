import { z } from "zod";

/** Tier de cuenta. El gating de features Mentor es un simple check de flag (Tech Spec §15). */
export const UserTier = z.enum(["free", "mentor"]);
export type UserTier = z.infer<typeof UserTier>;

/** Niveles de exposición del Perfil Público (FR-34), del más cerrado al detalle. */
export const PublicProfileLevel = z.enum([
  "none",
  "summary", // sólo cifras cabecera con Sello
  "metrics", // métricas verificadas + declaradas etiquetadas
  "detail", // detalle de operaciones + Radar Score si el Mentor lo activa
]);
export type PublicProfileLevel = z.infer<typeof PublicProfileLevel>;

export const User = z.object({
  id: z.string().uuid(),
  handle: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, "sólo minúsculas, dígitos y guion bajo"),
  email: z.string().email(),
  tier: UserTier.default("free"),
  publicProfileLevel: PublicProfileLevel.default("none"),
  /** Ventana de Retardo: una operación/anotación no se publica antes de N días. */
  delayWindowDays: z.number().int().min(0).max(90).default(0),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof User>;
