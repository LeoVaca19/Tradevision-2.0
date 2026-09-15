import type { TradeSet, VerifiedTrade } from "@tradevision/contracts";

/**
 * Datos de demostración para el panel. NO son datos verificados reales — sólo
 * alimentan la vista mientras no hay integración de bróker. En producción este
 * módulo desaparece y el `TradeSet` viene de la BD.
 */

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function demoTradeSet(count = 68, seed = 2026): TradeSet {
  const rnd = lcg(seed);
  const account = "11111111-1111-4111-8111-111111111111";
  const day0 = Date.UTC(2026, 0, 6, 15, 0, 0);
  const verified: VerifiedTrade[] = [];

  for (let i = 0; i < count; i++) {
    const isWin = rnd() < 0.54;
    const r = isWin ? 1.6 + rnd() * 1.2 : -(0.8 + rnd() * 0.5);
    const opened = new Date(day0 + i * 86_400_000 + Math.floor(rnd() * 6) * 3_600_000);
    const closed = new Date(opened.getTime() + (30 + Math.floor(rnd() * 180)) * 60_000);
    verified.push({
      id: uuid(i + 1),
      book: "verified",
      verified: true,
      instrument: ["EURUSD", "GBPUSD", "US30", "XAUUSD"][i % 4]!,
      side: isWin ? "long" : "short",
      volume: 1,
      entryPrice: 1.1,
      exitPrice: isWin ? 1.12 : 1.09,
      openedAt: opened.toISOString(),
      closedAt: closed.toISOString(),
      commission: -2.1,
      swap: 0,
      pnlCurrency: Math.round(r * 100 * 100) / 100,
      pnlR: Math.round(r * 100) / 100,
      connectedAccountId: account,
      engineIngestVersion: "0",
    });
  }

  return { verified, manual: [], notTaken: [], annotations: {} };
}
