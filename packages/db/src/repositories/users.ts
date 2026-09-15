import { asc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { users } from "../schema.js";

export interface UserBasics {
  id: string;
  handle: string;
  tier: "free" | "mentor";
  delayWindowDays: number;
  publicProfileLevel: "none" | "summary" | "metrics" | "detail";
}

export async function getUserById(db: DB, id: string): Promise<UserBasics | null> {
  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      tier: users.tier,
      delayWindowDays: users.delayWindowDays,
      publicProfileLevel: users.publicProfileLevel,
    })
    .from(users)
    .where(eq(users.id, id));
  return row ?? null;
}

/** Dev-only: primer usuario por antigüedad. Sustituir por auth real. */
export async function getFirstUser(db: DB): Promise<UserBasics | null> {
  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      tier: users.tier,
      delayWindowDays: users.delayWindowDays,
      publicProfileLevel: users.publicProfileLevel,
    })
    .from(users)
    .orderBy(asc(users.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getUserByHandle(db: DB, handle: string): Promise<UserBasics | null> {
  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      tier: users.tier,
      delayWindowDays: users.delayWindowDays,
      publicProfileLevel: users.publicProfileLevel,
    })
    .from(users)
    .where(eq(users.handle, handle));
  return row ?? null;
}
