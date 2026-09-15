import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { connectedAccounts, tradingAccounts, tradeExecutions, verifiedTrades } from "../schema.js";
import { toDbNumericOrNull, toNumber, toNumberOrNull } from "../numeric.js";

/**
 * Cuentas nombrables (comparar "Topstep 50K" vs "FTMO", etc.) — ortogonales a
 * los libros. Ver `schema.ts` sobre `trading_accounts`. No es un libro nuevo:
 * las stats de una cuenta `broker_synced` siguen saliendo sólo de
 * `verified_trades` filtradas por `connected_account_id` (orquestado en
 * `apps/web/lib/data.ts`, que sí puede importar `@tradevision/engine`; este
 * paquete no).
 */

export interface CreateTradingAccountInput {
  name: string;
  kind: "broker_synced" | "manual";
  profitCalcMethod?: "fifo" | "lifo" | "wavg";
  currency?: string;
  initialBalance?: number | null;
}

export interface TradingAccountRow {
  id: string;
  userId: string;
  name: string;
  kind: "broker_synced" | "manual";
  profitCalcMethod: "fifo" | "lifo" | "wavg";
  currency: string;
  initialBalance: number | null;
  archivedAt: Date | null;
  createdAt: Date;
  connectedAccountId: string | null;
}

/**
 * `connectedAccountId` sale de la FK inversa en `connected_accounts` (1:1):
 * `trading_accounts` no guarda esa columna para no duplicar la relación.
 */
export async function listTradingAccounts(db: DB, userId: string): Promise<TradingAccountRow[]> {
  const rows = await db
    .select({
      id: tradingAccounts.id,
      userId: tradingAccounts.userId,
      name: tradingAccounts.name,
      kind: tradingAccounts.kind,
      profitCalcMethod: tradingAccounts.profitCalcMethod,
      currency: tradingAccounts.currency,
      initialBalance: tradingAccounts.initialBalance,
      archivedAt: tradingAccounts.archivedAt,
      createdAt: tradingAccounts.createdAt,
      connectedAccountId: connectedAccounts.id,
    })
    .from(tradingAccounts)
    .leftJoin(connectedAccounts, eq(connectedAccounts.tradingAccountId, tradingAccounts.id))
    .where(eq(tradingAccounts.userId, userId))
    .orderBy(desc(tradingAccounts.createdAt));
  return rows.map((r) => ({ ...r, initialBalance: toNumberOrNull(r.initialBalance) }));
}

export async function createTradingAccount(
  db: DB,
  userId: string,
  input: CreateTradingAccountInput,
): Promise<Omit<TradingAccountRow, "connectedAccountId">> {
  const [row] = await db
    .insert(tradingAccounts)
    .values({
      userId,
      name: input.name,
      kind: input.kind,
      profitCalcMethod: input.profitCalcMethod ?? "fifo",
      currency: input.currency ?? "USD",
      initialBalance: toDbNumericOrNull(input.initialBalance ?? null),
    })
    .returning();
  return { ...row!, initialBalance: toNumberOrNull(row!.initialBalance) };
}

export async function archiveTradingAccount(db: DB, userId: string, id: string): Promise<void> {
  await db
    .update(tradingAccounts)
    .set({ archivedAt: new Date() })
    .where(and(eq(tradingAccounts.id, id), eq(tradingAccounts.userId, userId)));
}

/**
 * Enlaza una `connected_accounts` (conexión MetaApi ya dada de alta) a una
 * cuenta nombrable — la pasa de `manual` a `broker_synced`. 1:1: falla en
 * silencio (0 filas afectadas) si `connectedAccountId` no pertenece al usuario.
 */
export async function linkConnectedAccount(
  db: DB,
  userId: string,
  input: { tradingAccountId: string; connectedAccountId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(connectedAccounts)
      .set({ tradingAccountId: input.tradingAccountId })
      .where(and(eq(connectedAccounts.id, input.connectedAccountId), eq(connectedAccounts.userId, userId)));

    await tx
      .update(tradingAccounts)
      .set({ kind: "broker_synced" })
      .where(and(eq(tradingAccounts.id, input.tradingAccountId), eq(tradingAccounts.userId, userId)));
  });
}

export interface TradeExecutionRow {
  id: string;
  verifiedTradeId: string;
  brokerDealId: string;
  side: "long" | "short";
  quantity: number;
  price: number;
  fee: number;
  executedAt: Date;
}

/**
 * Fills/deals crudos de una operación del Libro Verificado, sólo lectura.
 * HOY SIEMPRE VACÍA: no existe todavía el ingestor que escriba
 * `trade_executions` (gap del motor de round-trips — se resuelve en el
 * Bloque 6 con `packages/integrations/src/round-trips.ts`; el ingestor en sí
 * sigue sin construir). El repo y el contrato quedan listos para cuando
 * exista; no se inventan filas.
 */
export async function getTradeExecutions(
  db: DB,
  userId: string,
  verifiedTradeId: string,
): Promise<TradeExecutionRow[]> {
  const rows = await db
    .select({
      id: tradeExecutions.id,
      verifiedTradeId: tradeExecutions.verifiedTradeId,
      brokerDealId: tradeExecutions.brokerDealId,
      side: tradeExecutions.side,
      quantity: tradeExecutions.quantity,
      price: tradeExecutions.price,
      fee: tradeExecutions.fee,
      executedAt: tradeExecutions.executedAt,
    })
    .from(tradeExecutions)
    .innerJoin(verifiedTrades, eq(verifiedTrades.id, tradeExecutions.verifiedTradeId))
    .where(and(eq(tradeExecutions.verifiedTradeId, verifiedTradeId), eq(verifiedTrades.userId, userId)))
    .orderBy(tradeExecutions.executedAt);
  return rows.map((r) => ({
    ...r,
    quantity: toNumber(r.quantity),
    price: toNumber(r.price),
    fee: toNumber(r.fee),
  }));
}
