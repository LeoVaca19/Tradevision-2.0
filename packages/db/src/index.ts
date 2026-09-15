// @tradevision/db — client + repositorios.
//
// Los repositorios (trades, catalogs, stats, accounts, users) se agregan acá
// en el resto del Bloque 5, según se vayan escribiendo.
export * as schema from "./schema.js";
export { getDb, type DB } from "./client.js";
