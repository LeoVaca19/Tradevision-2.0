import type { NotTakenTrade, TradeAnnotationProps, TradeSet, VerifiedTrade } from "@tradevision/contracts";

/** LCG determinista — sin `Math.random`, para datasets reproducibles. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

export interface FixtureOptions {
  count: number;
  seed?: number;
  winProb?: number;
  winR?: number;
  lossR?: number;
}

/**
 * Genera un Libro Verificado determinista. Cada operación cierra un día después
 * de la anterior a las 15:00Z; pnlR es +winR (ganadora) o -lossR (perdedora)
 * según el LCG. `pnlCurrency = pnlR * 100`.
 */
export function makeVerified(opts: FixtureOptions): VerifiedTrade[] {
  const { count, seed = 42, winProb = 0.5, winR = 2, lossR = 1 } = opts;
  const rnd = lcg(seed);
  const trades: VerifiedTrade[] = [];
  const day0 = Date.UTC(2026, 0, 1, 15, 0, 0);

  for (let i = 0; i < count; i++) {
    const isWin = rnd() < winProb;
    const pnlR = isWin ? winR : -lossR;
    const opened = new Date(day0 + i * 86_400_000);
    const closed = new Date(opened.getTime() + 3_600_000);
    trades.push({
      id: uuid(i + 1),
      book: "verified",
      verified: true,
      instrument: i % 2 === 0 ? "EURUSD" : "GBPUSD",
      side: isWin ? "long" : "short",
      volume: 1,
      entryPrice: 1.1,
      exitPrice: isWin ? 1.12 : 1.09,
      openedAt: opened.toISOString(),
      closedAt: closed.toISOString(),
      commission: 0,
      swap: 0,
      pnlCurrency: pnlR * 100,
      pnlR,
      connectedAccountId: ACCOUNT,
      engineIngestVersion: "0",
    });
  }
  return trades;
}

export function makeNotTaken(count: number, seed = 7): NotTakenTrade[] {
  const rnd = lcg(seed);
  const out: NotTakenTrade[] = [];
  const day0 = Date.UTC(2026, 0, 1, 12, 0, 0);
  const reasons = ["fear", "doubt", "missed_in_time", "outside_session"] as const;
  for (let i = 0; i < count; i++) {
    out.push({
      id: uuid(1000 + i),
      book: "not_taken",
      instrument: "EURUSD",
      side: rnd() < 0.5 ? "long" : "short",
      identifiedAt: new Date(day0 + i * 86_400_000).toISOString(),
      reason: reasons[Math.floor(rnd() * reasons.length)]!,
      plannedEntry: 1.1,
      plannedStop: 1.09,
      plannedTarget: 1.13,
      hypotheticalOutcome: null,
      hypotheticalPnlR: null,
    });
  }
  return out;
}

export function makeTradeSet(overrides: Partial<TradeSet> = {}): TradeSet {
  return {
    verified: [],
    manual: [],
    notTaken: [],
    annotations: {},
    ...overrides,
  };
}

export function annotate(
  ids: string[],
  props: Partial<TradeAnnotationProps>,
): Record<string, TradeAnnotationProps> {
  const base: TradeAnnotationProps = { confluenceIds: [], emotionalStateIds: [] };
  return Object.fromEntries(ids.map((id) => [id, { ...base, ...props }]));
}

export { uuid };
