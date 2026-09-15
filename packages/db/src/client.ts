import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

/**
 * Conexión perezosa y asíncrona a Postgres real (Supabase).
 *
 *  - No conecta ni lanza en el import: sólo en el primer `await getDb()`.
 *  - Singleton: llamadas repetidas reusan la misma conexión (`postgres-js`).
 *
 * Nota de migración (Bloque 5, ver MIGRATION_PLAN.md §1.2): el proyecto
 * anterior (`../../tradevision/packages/db/src/client.ts`) tenía una segunda
 * rama con PGlite (Postgres en WASM, en proceso, sin instalar nada) para un
 * "modo dev sin Postgres real". Nunca llegó a usarse desde la web — el
 * bundler de Next-dev rompía cargando sus assets `.wasm` — y quedó
 * documentado como código inalcanzable en la práctica
 * (`../../tradevision/PROGRESS.md` §4.6). El modo demo real de este proyecto
 * (`USING_REAL_DB` → `demo-store.ts` en memoria, decidido en el Bloque 1 de
 * la migración) ya cubre "ver la app sin infraestructura", así que esa rama
 * no se porta acá: `getDb()` asume que sólo se llama cuando `DATABASE_URL`
 * está presente (la fachada `apps/web/lib/data.ts` es quien decide eso antes
 * de llamarlo) y lanza un error claro si no lo está, en vez de caer en un
 * modo alternativo silencioso.
 */

type AnyDb = PgDatabase<any, typeof schema, any>;

let _db: AnyDb | null = null;
let _init: Promise<AnyDb> | null = null;

async function createRealPostgres(url: string): Promise<AnyDb> {
  const [{ drizzle }, postgresMod] = await Promise.all([
    import("drizzle-orm/postgres-js"),
    import("postgres"),
  ]);
  // Supabase exige TLS; en local (localhost / 127.0.0.1) se desactiva.
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = postgresMod.default(url, {
    prepare: false,
    ssl: isLocal ? false : "require",
  });
  return drizzle(client, { schema }) as unknown as AnyDb;
}

export async function getDb(): Promise<AnyDb> {
  if (_db) return _db;
  if (!_init) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "[db] Falta DATABASE_URL. getDb() sólo debe llamarse cuando USING_REAL_DB es true " +
          "(apps/web/lib/data.ts) — sin BD real este proyecto usa demo-store.ts en memoria.",
      );
    }
    _init = createRealPostgres(url)
      .then((d) => {
        _db = d;
        return d;
      })
      .catch((err) => {
        _init = null;
        console.error("[db] fallo al inicializar:", err);
        throw err;
      });
  }
  return _init;
}

export type DB = AnyDb;
