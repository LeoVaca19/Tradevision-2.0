/**
 * Motor de reconstrucción de operaciones a partir de fills/deals crudos de
 * bróker (round-trips). PURO: sin I/O, sin red, sin `Date.now()`. Reemplaza el
 * emparejador naive `entry = primer deal / exit = último deal` que tenía el
 * proyecto anterior (descartaba en silencio cualquier fill intermedio:
 * scale-in, scale-out, flip — crítico en cuentas de prop firm de futuros,
 * nuestro público objetivo).
 *
 * Diseño adaptado (no copiado) de `docs/references/luxalgo-trade-journal/
 * packages/core/src/round-trips.ts` (MIT) — ver `../../tradevision/PROGRESS.md`
 * §5-bis/§5-cuater. Misma lógica de fondo (pila de lotes FIFO/LIFO/WAVG, split
 * pro-rata al cruzar por flat) reescrita en nuestro estilo, con dos
 * diferencias deliberadas:
 *
 * 1. `Fill.profit` (opcional): si el bróker ya reporta el P&L de ESE fill
 *    (MetaApi/MT5 sí lo hace en `profit`), se prorratea y se usa tal cual en
 *    vez de recalcularlo por precio — evita reinventar el pip value / tamaño
 *    de contrato por instrumento, que MetaApi ya resuelve. Sin ese dato
 *    (fills manuales, CSV) cae al cálculo por precio, igual que LuxAlgo.
 * 2. Comisión y swap se acarrean SEPARADOS (no un `fee` combinado) porque
 *    `verified_trades.commission` / `.swap` son columnas propias en el
 *    esquema — se combinan sólo al persistir un fill individual en
 *    `trade_executions` (una sola columna `fee` ahí, es sólo auditoría).
 */

/** Cantidad por debajo de la cual se considera "en cero" (float drift). */
const FLAT_EPS = 1e-9;

export type ProfitCalcMethod = "fifo" | "lifo" | "wavg";

/** Fill/deal crudo, YA normalizado desde el formato del bróker. */
export interface Fill {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  commission: number;
  swap: number;
  /** P&L que el bróker ya calculó para ESTE fill (p. ej. MetaApi `profit`). */
  profit?: number;
  /** ISO. */
  executedAt: string;
}

/**
 * Porción de un fill atribuida a ESTA operación. La misma `fillId` puede
 * aparecer en dos `RoundTrip` distintos con `quantity` distinta cuando un fill
 * cruza por flat (cierra una posición y abre la contraria) — de ahí que la
 * cantidad y el fee vayan prorrateados, nunca el fill completo.
 */
export interface FillAttribution {
  fillId: string;
  role: "entry" | "exit";
  quantity: number;
  price: number;
  /** Comisión + swap prorrateados a esta porción (una sola columna en `trade_executions`). */
  fee: number;
  executedAt: string;
}

export interface RoundTrip {
  /** Clave estable para dedupe/idempotencia (símbolo + dirección + apertura + colisión). */
  key: string;
  symbol: string;
  direction: "long" | "short";
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  /** Volumen de entrada (suma de lotes abiertos, no el remanente). */
  quantity: number;
  /** > 0 mientras la posición siga abierta; 0 si `status === "closed"`. */
  openQuantity: number;
  avgEntry: number;
  avgExit: number | null;
  /** P&L bruto (antes de comisión/swap). */
  grossPnl: number;
  commission: number;
  swap: number;
  /** `grossPnl + commission + swap` — lo que va a `verified_trades.pnl_currency`. */
  netPnl: number;
  /** Todos los fills que tocaron esta operación, con la porción exacta atribuida. */
  fills: FillAttribution[];
}

interface OpenLot {
  quantity: number;
  price: number;
}

interface OpenCycle {
  direction: "long" | "short";
  openedAt: string;
  lots: OpenLot[];
  entryQuantity: number;
  entryNotional: number;
  exitQuantity: number;
  exitNotional: number;
  grossPnl: number;
  commission: number;
  swap: number;
  fills: FillAttribution[];
}

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);
const openQuantityOf = (cycle: OpenCycle): number => sum(cycle.lots.map((l) => l.quantity));

/**
 * Consume `quantity` de los lotes abiertos según el método y devuelve el
 * notional (precio × cantidad) efectivamente emparejado. Muta `cycle.lots`.
 */
function consumeLots(cycle: OpenCycle, quantity: number, method: ProfitCalcMethod): number {
  if (method === "wavg") {
    const totalQty = openQuantityOf(cycle);
    const totalNotional = sum(cycle.lots.map((l) => l.quantity * l.price));
    const avgPrice = totalQty > 0 ? totalNotional / totalQty : 0;
    const matched = avgPrice * quantity;
    const scale = totalQty > 0 ? (totalQty - quantity) / totalQty : 0;
    cycle.lots = cycle.lots.map((l) => ({ ...l, quantity: l.quantity * scale })).filter((l) => l.quantity > FLAT_EPS);
    return matched;
  }

  let remaining = quantity;
  let matched = 0;
  while (remaining > FLAT_EPS && cycle.lots.length > 0) {
    const index = method === "fifo" ? 0 : cycle.lots.length - 1;
    const lot = cycle.lots[index]!;
    const take = Math.min(lot.quantity, remaining);
    matched += take * lot.price;
    lot.quantity -= take;
    remaining -= take;
    if (lot.quantity <= FLAT_EPS) cycle.lots.splice(index, 1);
  }
  return matched;
}

function finalizeCycle(
  cycle: OpenCycle,
  symbol: string,
  closedAt: string | undefined,
  keyCollisions: Map<string, number>,
): RoundTrip {
  const openQuantity = openQuantityOf(cycle);
  const isOpen = openQuantity > FLAT_EPS;
  const netPnl = cycle.grossPnl + cycle.commission + cycle.swap;

  const baseKey = `${symbol}|${cycle.direction}|${cycle.openedAt}`;
  const collision = keyCollisions.get(baseKey) ?? 0;
  keyCollisions.set(baseKey, collision + 1);
  const key = collision === 0 ? baseKey : `${baseKey}|${collision}`;

  return {
    key,
    symbol,
    direction: cycle.direction,
    status: isOpen ? "open" : "closed",
    openedAt: cycle.openedAt,
    closedAt: isOpen ? null : (closedAt ?? null),
    quantity: cycle.entryQuantity,
    openQuantity: isOpen ? openQuantity : 0,
    avgEntry: cycle.entryQuantity > 0 ? cycle.entryNotional / cycle.entryQuantity : 0,
    avgExit: cycle.exitQuantity > 0 ? cycle.exitNotional / cycle.exitQuantity : null,
    grossPnl: cycle.grossPnl,
    commission: cycle.commission,
    swap: cycle.swap,
    netPnl,
    fills: cycle.fills,
  };
}

const compareFills = (a: Fill, b: Fill): number =>
  Date.parse(a.executedAt) - Date.parse(b.executedAt) || a.id.localeCompare(b.id);

/**
 * Reconstruye operaciones (flat → flat) a partir de fills crudos de UN
 * símbolo (agrupar por cuenta+símbolo es responsabilidad del caller, ver
 * `metaapi.ts`). Invariantes:
 *
 * - Un fill que cruza por flat se divide: la parte que cruza cierra el ciclo,
 *   el remanente abre un ciclo nuevo en la dirección contraria (flip) — la
 *   comisión, el swap y el `profit` reportado (si lo hay) se prorratean por
 *   cantidad entre las dos partes.
 * - El P&L total de un ciclo cerrado no depende del método (`fifo`/`lifo`/
 *   `wavg`); el método sólo cambia la atribución por fill (y, sin `profit`
 *   reportado, el bruto exacto de cada tramo).
 * - Los fills se procesan en orden `executedAt` (empate por `id`) — el
 *   resultado es determinista sin importar el orden de entrada.
 */
export function buildRoundTrips(fills: Fill[], options: { method?: ProfitCalcMethod } = {}): RoundTrip[] {
  const method = options.method ?? "fifo";
  const trips: RoundTrip[] = [];
  const keyCollisions = new Map<string, number>();

  const bySymbol = new Map<string, Fill[]>();
  for (const fill of fills) {
    const group = bySymbol.get(fill.symbol) ?? [];
    group.push(fill);
    bySymbol.set(fill.symbol, group);
  }

  for (const [symbol, group] of bySymbol) {
    const sorted = [...group].sort(compareFills);
    let cycle: OpenCycle | null = null;

    for (const fill of sorted) {
      const totalQty = fill.quantity;
      let signedQty = fill.side === "buy" ? fill.quantity : -fill.quantity;
      let commissionRemaining = fill.commission;
      let swapRemaining = fill.swap;
      const profitRemaining = fill.profit;

      while (Math.abs(signedQty) > FLAT_EPS) {
        if (!cycle) {
          cycle = {
            direction: signedQty > 0 ? "long" : "short",
            openedAt: fill.executedAt,
            lots: [],
            entryQuantity: 0,
            entryNotional: 0,
            exitQuantity: 0,
            exitNotional: 0,
            grossPnl: 0,
            commission: 0,
            swap: 0,
            fills: [],
          };
        }

        const isEntry =
          (cycle.direction === "long" && signedQty > 0) || (cycle.direction === "short" && signedQty < 0);

        if (isEntry) {
          const qty = Math.abs(signedQty);
          cycle.lots.push({ quantity: qty, price: fill.price });
          cycle.entryQuantity += qty;
          cycle.entryNotional += qty * fill.price;
          cycle.commission += commissionRemaining;
          cycle.swap += swapRemaining;
          cycle.fills.push({
            fillId: fill.id,
            role: "entry",
            quantity: qty,
            price: fill.price,
            fee: commissionRemaining + swapRemaining,
            executedAt: fill.executedAt,
          });
          commissionRemaining = 0;
          swapRemaining = 0;
          signedQty = 0;
        } else {
          const openQty = openQuantityOf(cycle);
          const exitQty = Math.min(Math.abs(signedQty), openQty);
          const matchedNotional = consumeLots(cycle, exitQty, method);
          const exitNotional = exitQty * fill.price;
          const share = totalQty > 0 ? exitQty / totalQty : 0;
          const chunkGross =
            profitRemaining !== undefined
              ? profitRemaining * share
              : cycle.direction === "long"
                ? exitNotional - matchedNotional
                : matchedNotional - exitNotional;
          const commissionShare = commissionRemaining * share;
          const swapShare = swapRemaining * share;
          // El remanente sigue al posible flip que abre el ciclo contrario
          // (rama `isEntry` más abajo, misma vuelta del `for`) — sin esto se
          // contaría dos veces la comisión/swap del fill.
          commissionRemaining -= commissionShare;
          swapRemaining -= swapShare;

          cycle.grossPnl += chunkGross;
          cycle.commission += commissionShare;
          cycle.swap += swapShare;
          cycle.exitQuantity += exitQty;
          cycle.exitNotional += exitNotional;
          cycle.fills.push({
            fillId: fill.id,
            role: "exit",
            quantity: exitQty,
            price: fill.price,
            fee: commissionShare + swapShare,
            executedAt: fill.executedAt,
          });

          signedQty += cycle.direction === "long" ? exitQty : -exitQty;

          if (openQuantityOf(cycle) <= FLAT_EPS) {
            trips.push(finalizeCycle(cycle, symbol, fill.executedAt, keyCollisions));
            cycle = null;
            // El remanente de `signedQty` (si lo hay) abre el ciclo contrario
            // en la próxima vuelta del while; el remanente de comisión/swap/
            // profit lo acompaña (ya descontada la porción recién asignada).
          }
        }
      }

      if (cycle && (commissionRemaining !== 0 || swapRemaining !== 0)) {
        // Fill de cantidad cero (dato sucio) — no perder el fee igual.
        cycle.commission += commissionRemaining;
        cycle.swap += swapRemaining;
      }
    }

    if (cycle) trips.push(finalizeCycle(cycle, symbol, undefined, keyCollisions));
  }

  trips.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.key.localeCompare(b.key));
  return trips;
}
