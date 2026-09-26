import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Puesta a punto de una base de datos Postgres real (Supabase, Neon, local…):
 *   1. aplica las migraciones de `drizzle/`
 *   2. instala el trigger append-only de `sql/append_only.sql`
 *   3. activa RLS + revoca grants de la Data API (`sql/rls.sql`)
 *   4. siembra catálogos globales
 *   5. crea un usuario `dev` sembrado (no ligado a Supabase Auth; sólo para scripts de dev)
 *
 *   pnpm --filter @tradevision/db exec tsx src/setup.ts
 *
 * Lee `DATABASE_URL` de `process.env` o, si falta, de `packages/db/.env`.
 * Idempotente: se puede correr varias veces sin duplicar nada.
 */

function readEnvFile(): string | undefined {
  try {
    const raw = readFileSync(fileURLToPath(new URL("../.env", import.meta.url)), "utf8");
    const m = raw.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    return m?.[1]?.replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const url = process.env.DATABASE_URL ?? readEnvFile();
if (!url) {
  console.error("Falta DATABASE_URL (ni en el entorno ni en packages/db/.env).");
  console.error("  postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres");
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const readSql = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./sql/${name}`, import.meta.url)), "utf8");
const appendOnlySql = readSql("append_only.sql");
const rlsSql = readSql("rls.sql");

async function main() {
  // `max: 1` y sin prepared statements: compatible con el pooler de Supabase.
  const sql = postgres(url!, { max: 1, prepare: false, ssl: url!.includes("localhost") ? false : "require" });
  const db = drizzle(sql, { schema });

  console.log("→ aplicando migraciones…");
  await migrate(db, { migrationsFolder });

  console.log("→ instalando trigger append-only…");
  await sql.unsafe(appendOnlySql);

  console.log("→ activando RLS + revocando grants de la Data API…");
  await sql.unsafe(rlsSql);

  console.log("→ sembrando catálogos globales…");
  const emo = [
    "Tranquilo",
    "Ansioso",
    "Con miedo a perder",
    "Eufórico",
    "Aburrido",
    "Frustrado",
    "Revancha",
    "Duda",
  ];
  const conf = [
    "FVG",
    "Order Block",
    "Liquidez tomada",
    "Cambio de estructura (CHoCH)",
    "BOS",
    "Nivel diario/semanal",
    "Sesión de Londres/NY",
    "Confirmación en LTF",
  ];
  // Catálogos GLOBALES (user_id NULL). Idempotentes gracias a las UNIQUE
  // NULLS NOT DISTINCT (migración 0004): con el UNIQUE normal, `on conflict do
  // nothing` nunca disparaba para user_id NULL y cada corrida agregaba otra copia.
  await sql`insert into emotional_states ${sql(emo.map((label) => ({ label })), "label")} on conflict do nothing`;
  await sql`insert into confluences ${sql(conf.map((label) => ({ label })), "label")} on conflict do nothing`;
  await sql`
    insert into setups (user_id, name, family) values
      (null, 'FVG + CHoCH', 'SMC'),
      (null, 'Silver Bullet', 'ICT'),
      (null, 'Ruptura de rango asiático', 'Price Action')
    on conflict do nothing
  `;

  console.log("→ creando usuario dev…");
  await sql`
    insert into users (auth_provider_id, handle, email, tier)
    values ('dev:leonardo', 'leonardo', 'leonardo.dev@tradevision.local', 'mentor')
    on conflict do nothing
  `;

  await sql.end();

  console.log("\n✔ Base de datos lista.");
}

main().catch((err) => {
  console.error("\n✖ Falló la puesta a punto:", err);
  process.exit(1);
});
