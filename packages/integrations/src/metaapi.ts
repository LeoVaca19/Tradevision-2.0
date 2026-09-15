import { z } from "zod";
import { buildRoundTrips, type Fill, type ProfitCalcMethod } from "./round-trips.js";

/**
 * Cliente MetaApi.cloud (Tech Spec §8). Build-vs-buy: se COMPRA el puente MT5/MT4.
 *
 * Este archivo deja la superficie tipada y el mapeo bróker → `verified_trades`.
 * La llamada HTTP real se implementa cuando haya `METAAPI_TOKEN`. Las
 * credenciales de bróker NUNCA llegan al cliente: sólo los jobs de Inngest usan
 * este módulo.
 */

export const MetaApiDeal = z.object({
  id: z.string(),
  symbol: z.string(),
  type: z.string(), // DEAL_TYPE_BUY / DEAL_TYPE_SELL
  volume: z.number(),
  price: z.number(),
  commission: z.number().default(0),
  swap: z.number().default(0),
  profit: z.number(),
  time: z.string(), // ISO
  /**
   * Ya NO se usan para agrupar/emparejar (ver `round-trips.ts`): MetaApi no
   * garantiza un `positionId` nuevo en cada flip, y el algoritmo de
   * round-trips no los necesita — agrupa por símbolo y reconstruye por
   * precio/tiempo. Se conservan en el tipo por si el payload real de MetaApi
   * los trae; simplemente no se leen.
   */
  positionId: z.string().optional(),
  entryType: z.string().optional(),
});
export type MetaApiDeal = z.infer<typeof MetaApiDeal>;

export interface NormalizedExecution {
  brokerDealId: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  /** Comisión + swap prorrateados a esta porción del deal. */
  fee: number;
  executedAt: string;
}

export interface NormalizedVerifiedTrade {
  brokerTradeId: string;
  instrument: string;
  side: "long" | "short";
  volume: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: string;
  closedAt: string;
  commission: number;
  swap: number;
  pnlCurrency: number;
  pnlR: number | null;
  /**
   * Fills que componen esta operación, en el orden en que se ejecutaron.
   * El caller (job de sync) los persiste en `trade_executions` DESPUÉS de
   * insertar la fila en `verified_trades` (necesita su `id`).
   */
  executions: NormalizedExecution[];
}

/**
 * Versión del mapeo bróker → `verified_trades`. Heredada en "1" del proyecto
 * anterior (ver `../../tradevision/PROGRESS.md` §5-cuater): la reconstrucción
 * ya usa el motor real de round-trips por fills, no el emparejador naive
 * "1er deal = entrada, último = salida" de versiones previas a esa.
 */
export const METAAPI_INGEST_VERSION = "1";

function toFill(deal: MetaApiDeal): Fill {
  return {
    id: deal.id,
    symbol: deal.symbol,
    side: deal.type.includes("BUY") ? "buy" : "sell",
    quantity: deal.volume,
    price: deal.price,
    commission: deal.commission ?? 0,
    swap: deal.swap ?? 0,
    profit: deal.profit,
    executedAt: deal.time,
  };
}

/**
 * Reconstruye operaciones CERRADAS de UNA cuenta a partir de sus deals crudos
 * (agrupa por símbolo — ver `round-trips.ts` — no por `positionId`). Las
 * posiciones que sigan abiertas (`status: "open"` en el round-trip) no
 * producen fila: `verified_trades` sólo registra operaciones cerradas.
 *
 * `options.method` es el `profitCalcMethod` de la `trading_accounts` dueña de
 * esta conexión (FIFO por defecto — ver `packages/db/src/schema.ts`).
 */
export function normalizeClosedPositions(
  deals: MetaApiDeal[],
  options: { method?: ProfitCalcMethod } = {},
): NormalizedVerifiedTrade[] {
  const dealsById = new Map(deals.map((d) => [d.id, d] as const));
  const trips = buildRoundTrips(deals.map(toFill), options);

  const out: NormalizedVerifiedTrade[] = [];
  for (const t of trips) {
    if (t.status !== "closed" || t.closedAt === null || t.avgExit === null) continue;

    out.push({
      brokerTradeId: t.key,
      instrument: t.symbol,
      side: t.direction,
      volume: t.quantity,
      entryPrice: t.avgEntry,
      exitPrice: t.avgExit,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      commission: t.commission,
      swap: t.swap,
      pnlCurrency: t.netPnl,
      pnlR: null,
      executions: t.fills.map((f) => ({
        brokerDealId: f.fillId,
        side: dealsById.get(f.fillId)!.type.includes("BUY") ? "buy" : "sell",
        quantity: f.quantity,
        price: f.price,
        fee: f.fee,
        executedAt: f.executedAt,
      })),
    });
  }
  return out;
}

export interface MetaApiClient {
  fetchHistory(accountId: string, sinceIso?: string): Promise<MetaApiDeal[]>;
}

export function createMetaApiClient(token = process.env.METAAPI_TOKEN): MetaApiClient {
  return {
    async fetchHistory() {
      if (!token) {
        throw new Error(
          "METAAPI_TOKEN no configurado. La integración de bróker (Tech Spec §8) aún no está activa.",
        );
      }
      throw new Error("TODO: llamada real a MetaApi.cloud history API.");
    },
  };
}
