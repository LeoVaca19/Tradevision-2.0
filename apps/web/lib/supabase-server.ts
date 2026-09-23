import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase Auth ligado a las cookies de la request (Server
 * Components, Server Actions, Route Handlers). Import dinámico de
 * `@tradevision/db` por el mismo motivo que en `lib/data.ts`.
 *
 * En un Server Component `cookies().set` lanza (sólo lectura): se ignora, el
 * middleware ya refresca la sesión en cada request.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  const db = await import("@tradevision/db");
  const store = await cookies();
  return db.createSupabaseServerClient({
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options);
      } catch {
        /* Server Component: el middleware refresca la sesión. */
      }
    },
  });
}
