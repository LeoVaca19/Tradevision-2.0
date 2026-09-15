// Bloque 0 de la migración (MIGRATION_PLAN.md §8) — script mínimo y AISLADO.
//
// No importa el esquema, no usa Drizzle, no depende de nada del resto del monorepo.
// Su único trabajo es confirmar que esta máquina puede abrir una conexión TCP+TLS
// real contra el Supabase NUEVO (proyecto v2) usando el DATABASE_URL de
// `packages/db/.env`, y correr una consulta trivial.
//
// Uso: pnpm --filter @tradevision/db exec tsx scripts/verify-connection.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

function loadEnvFile(relPath: string): void {
  const abs = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", relPath);
  const raw = readFileSync(abs, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(".env");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[verify-connection] Falta DATABASE_URL en packages/db/.env");
    process.exitCode = 1;
    return;
  }

  const safeUrl = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
  console.log(`[verify-connection] Conectando a: ${safeUrl}`);

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false,
    ssl: isLocal ? false : "require",
    connect_timeout: 10,
  });

  const start = Date.now();
  try {
    const rows = await sql`select now() as server_time, current_database() as db, current_user as role`;
    const elapsedMs = Date.now() - start;
    console.log(`[verify-connection] OK (${elapsedMs}ms)`, rows[0]);
  } catch (err) {
    const elapsedMs = Date.now() - start;
    console.error(`[verify-connection] FALLÓ tras ${elapsedMs}ms`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
