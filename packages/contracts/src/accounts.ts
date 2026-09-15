import { z } from "zod";
import { StatResult, RadarScore } from "./stats.js";

/**
 * Cuenta nombrable por el usuario ("Topstep 50K", "FTMO Challenge"), ortogonal
 * a los libros (Verificado/Manual/No Tomadas). Un trader con varias cuentas de
 * prop firm en simultáneo las usa para organizar y comparar sus operaciones —
 * decisión heredada del proyecto anterior (inspirado en LuxAlgo Trade Journal,
 * adaptado a nuestro esquema, no copiado; ver `../../tradevision/PROGRESS.md`
 * §5-bis).
 *
 * `broker_synced`: respaldada por una `connected_accounts` (MetaApi); sus
 * stats siguen viniendo EXCLUSIVAMENTE de `verified_trades` filtradas por esa
 * conexión — no es un libro nuevo, no cambia la segregación Verificado/Declarado.
 * `manual`: cuenta sin sincronización todavía; sólo organiza operaciones
 * manuales/no-tomadas. Puede enlazarse después a una `connected_accounts`
 * (pasa a `broker_synced`); nunca al revés.
 */
export const TradingAccountKind = z.enum(["broker_synced", "manual"]);
export type TradingAccountKind = z.infer<typeof TradingAccountKind>;

/** Cómo el motor de round-trips (`packages/integrations/src/round-trips.ts`) empareja lotes. */
export const ProfitCalcMethod = z.enum(["fifo", "lifo", "wavg"]);
export type ProfitCalcMethod = z.infer<typeof ProfitCalcMethod>;

export const TradingAccount = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  kind: TradingAccountKind,
  /** Sólo informado cuando kind = "broker_synced". */
  connectedAccountId: z.string().uuid().nullable(),
  profitCalcMethod: ProfitCalcMethod.default("fifo"),
  currency: z.string().default("USD"),
  /** Ancla el % de drawdown y el tamaño de cuenta. Null = sin definir todavía. */
  initialBalance: z.number().positive().nullable(),
  /** "Cerrada" sin borrar su historial. Null = activa. */
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type TradingAccount = z.infer<typeof TradingAccount>;

/** Un lado de la comparación: mismas cifras del motor, un recorte (cuenta + periodo). */
export const AccountComparisonSide = z.object({
  accountId: z.string().uuid(),
  accountName: z.string(),
  periodStart: z.string().datetime().nullable(),
  periodEnd: z.string().datetime().nullable(),
  metrics: z.array(StatResult),
  radar: RadarScore,
});
export type AccountComparisonSide = z.infer<typeof AccountComparisonSide>;

/**
 * Resultado de "comparar cuentas" (Tech Spec: nueva vista, no un libro nuevo).
 * `vs_account`: dos cuentas, mismo periodo (o cada una con el suyo, si se pide).
 * `vs_previous_period`: una cuenta, periodo actual vs. la ventana inmediatamente
 * anterior de igual longitud. Ambos lados son Estadística Verificada normal
 * (mismo `sealed`/`insufficient_data` que ya calcula `packages/engine`); esta
 * vista sólo empaqueta dos llamadas al motor con distinto `ForensicFilter`.
 */
export const AccountComparison = z.object({
  mode: z.enum(["vs_account", "vs_previous_period"]),
  a: AccountComparisonSide,
  b: AccountComparisonSide,
  engineVersion: z.string(),
});
export type AccountComparison = z.infer<typeof AccountComparison>;

/**
 * Fill/deal crudo de bróker que compone una operación del Libro Verificado.
 * SIEMPRE de sólo lectura para el usuario (append-only, igual que
 * `verified_trades`) — nunca editable a mano. Lista vacía hasta que exista el
 * motor de round-trips por fills; no se inventan datos mientras tanto.
 *
 * Nota heredada (sin resolver, `MIGRATION_PLAN.md` §4): `side` usa
 * `"long"|"short"` (dirección de la operación) en vez de `"buy"|"sell"`
 * (lado del fill), que sería lo semánticamente correcto para un fill
 * individual. Se mantiene igual que el proyecto anterior porque ya es un
 * contrato que el frontend antiguo consumía — no se cambia sin decisión
 * explícita, ver discrepancia listada en el plan de migración.
 */
export const TradeExecution = z.object({
  id: z.string().uuid(),
  verifiedTradeId: z.string().uuid(),
  brokerDealId: z.string(),
  side: z.enum(["long", "short"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().default(0),
  executedAt: z.string().datetime(),
});
export type TradeExecution = z.infer<typeof TradeExecution>;
