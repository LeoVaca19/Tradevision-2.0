import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase Auth para servidor (Server Components, Server Actions,
 * middleware). Usa SÓLO la anon key (pública por diseño); la service role
 * key no se usa ni se lee en este paquete.
 *
 * Las cookies se inyectan (`cookies`) para no acoplar este paquete a Next.
 */

export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function createSupabaseServerClient(cookies: CookieMethodsServer): SupabaseClient {
  const env = supabaseEnv();
  if (!env) {
    throw new Error(
      "[auth] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (ver packages/db/.env.example).",
    );
  }
  return createServerClient(env.url, env.anonKey, { cookies });
}
