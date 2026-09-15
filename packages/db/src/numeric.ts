/**
 * Conversión number ↔ numeric en el borde con Postgres.
 *
 * Bloque 4 de la migración (ver `schema.ts`, MIGRATION_PLAN.md §1.2): los
 * montos financieros usan columnas `numeric`, no `doublePrecision`, para no
 * perder precisión. `postgres-js`/drizzle-orm devuelven `numeric` como
 * `string` (para no pasar por un `number` de JS al leer) y esperan `string`
 * al escribir. `@tradevision/contracts` y `@tradevision/engine` trabajan en
 * `number` de punta a punta — TODA esta conversión vive acá, no repartida
 * por cada repositorio.
 */

export function toNumber(v: string): number {
  return Number(v);
}

export function toNumberOrNull(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

export function toDbNumeric(v: number): string {
  return v.toString();
}

export function toDbNumericOrNull(v: number | null | undefined): string | null {
  return v == null ? null : v.toString();
}
