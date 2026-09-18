import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "./client.js";
import { getFirstUser, getUserByHandle } from "./repositories/users.js";
import { materializeStatSnapshots } from "./repositories/stats.js";

/**
 * Invocador manual de `materializeStatSnapshots` (ver `repositories/stats.ts`).
 * Cubre "falta qué invoque loadTradeSet/saveStatSnapshots" (`STATUS.md`,
 * `../../tradevision/PROGRESS.md` §5) hasta que exista el job Inngest real
 * (Tech Spec §7) — mientras tanto, sirve para materializar bajo demanda y para
 * verificar la tubería contra Supabase real.
 *
 *   pnpm --filter @tradevision/db materialize-stats [handle]
 *
 * Sin `handle`: usa el primer usuario por antigüedad (dev). Lee `DATABASE_URL`
 * de `process.env` o, si falta, de `packages/db/.env` (mismo criterio que
 * `setup.ts`).
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

if (!process.env.DATABASE_URL) {
  const fromFile = readEnvFile();
  if (fromFile) process.env.DATABASE_URL = fromFile;
}

async function main() {
  const handle = process.argv[2];
  const db = await getDb();

  const user = handle ? await getUserByHandle(db, handle) : await getFirstUser(db);
  if (!user) {
    console.error(handle ? `No existe ningún usuario con handle "${handle}".` : "No hay ningún usuario en la base.");
    process.exit(1);
  }

  console.log(`→ materializando stat_snapshots para "${user!.handle}" (${user!.id})…`);
  const { metrics, radar } = await materializeStatSnapshots(db, user!.id);

  console.log(`✔ ${metrics.length} métricas + ${radar.axes.length} ejes del Radar + 1 compuesto guardados.`);
  for (const m of metrics) {
    console.log(`  ${m.metric}: ${m.value.kind === "value" ? m.value.value : `insufficient_data (n=${m.value.sampleSize})`}`);
  }
  console.log(
    `  radar_composite: ${radar.composite.kind === "value" ? radar.composite.value.toFixed(2) : "insufficient_data"}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✖ Falló la materialización:", err);
  process.exit(1);
});
