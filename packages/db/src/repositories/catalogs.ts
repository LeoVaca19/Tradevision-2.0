import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { DB } from "../client.js";
import { confluences, emotionalStates, setups } from "../schema.js";

/**
 * Catálogos del registro tipo Notion (Tech Spec §6.1). `emotional_states` y
 * `confluences` tienen alcance global (`user_id IS NULL`) + custom por usuario.
 */

export interface CatalogItem {
  id: string;
  label: string;
  scope: "global" | "custom";
}

export async function listSetups(db: DB, userId: string) {
  return db
    .select({ id: setups.id, name: setups.name, family: setups.family })
    .from(setups)
    .where(eq(setups.userId, userId))
    .orderBy(asc(setups.name));
}

export async function createSetup(
  db: DB,
  userId: string,
  input: { name: string; family?: string | null },
) {
  const [row] = await db
    .insert(setups)
    .values({ userId, name: input.name, family: input.family ?? null })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

async function listScopedCatalog(
  db: DB,
  table: typeof emotionalStates | typeof confluences,
  userId: string,
): Promise<CatalogItem[]> {
  const rows = await db
    .select({ id: table.id, label: table.label, userId: table.userId })
    .from(table)
    .where(or(isNull(table.userId), eq(table.userId, userId)))
    .orderBy(asc(table.label));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    scope: r.userId == null ? "global" : "custom",
  }));
}

export const listEmotionalStates = (db: DB, userId: string) =>
  listScopedCatalog(db, emotionalStates, userId);

export const listConfluences = (db: DB, userId: string) =>
  listScopedCatalog(db, confluences, userId);

export async function createConfluence(db: DB, userId: string, label: string) {
  const [row] = await db
    .insert(confluences)
    .values({ userId, label })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function createEmotionalState(db: DB, userId: string, label: string) {
  const [row] = await db
    .insert(emotionalStates)
    .values({ userId, label })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Valida que un conjunto de ids de catálogo pertenece al alcance del usuario. */
export async function assertCatalogIdsVisible(
  db: DB,
  table: typeof emotionalStates | typeof confluences,
  userId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(or(isNull(table.userId), eq(table.userId, userId))));
  const visible = new Set(rows.map((r) => r.id));
  const bad = ids.filter((id) => !visible.has(id));
  if (bad.length > 0) {
    throw new Error(`ids de catálogo fuera de alcance: ${bad.join(", ")}`);
  }
}
