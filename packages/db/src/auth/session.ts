import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { users } from "../schema.js";
import type { UserBasics } from "../repositories/users.js";

/**
 * Usuario actual = sesión de Supabase Auth → fila de `public.users`
 * (`auth_provider_id = auth.users.id`, creada por el trigger del registro).
 *
 * Usa `auth.getUser()` (valida el JWT contra Supabase), NO `getSession()`,
 * que sólo lee la cookie sin verificarla.
 */

export interface SessionUser extends UserBasics {
  email: string;
}

export async function getSessionUser(
  supabase: SupabaseClient,
  db: DB,
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [row] = await db
    .select({
      id: users.id,
      handle: users.handle,
      email: users.email,
      tier: users.tier,
      delayWindowDays: users.delayWindowDays,
      publicProfileLevel: users.publicProfileLevel,
    })
    .from(users)
    .where(eq(users.authProviderId, data.user.id));
  return row ?? null;
}
