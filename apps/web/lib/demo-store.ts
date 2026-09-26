import { randomUUID } from "node:crypto";
import type { ExitReason, TradeAnnotationProps } from "@tradevision/contracts";
import type { TradeBook } from "@/lib/trade-view";

/**
 * Almacén EN MEMORIA para la demo local (sin Postgres). Vive en el proceso del
 * dev server; se reinicia con él. Reproduce sólo lo que consumen las páginas de
 * registro. En cuanto haya `DATABASE_URL`, `lib/data.ts` usa los repos reales de
 * `@tradevision/db` y este archivo deja de intervenir.
 *
 * Respeta la regla del PRD: la anotación se guarda aparte y nunca modifica los
 * campos núcleo de la operación (FR-9).
 */

export interface DemoUser {
  id: string;
  handle: string;
  tier: "free" | "mentor";
  delayWindowDays: number;
  publicProfileLevel: "none" | "summary" | "metrics" | "detail";
}

export interface CoreTrade {
  id: string;
  book: TradeBook;
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
  verified: boolean;
  /** Sólo operaciones manuales; las sembradas de la demo no lo traen (no se inventa). */
  exitReason?: ExitReason | null;
}

export interface NotTaken {
  id: string;
  book: "not_taken";
  instrument: string;
  side: "long" | "short";
  identifiedAt: string;
  reason: string;
}

export interface Annotation extends TradeAnnotationProps {
  journalNote: unknown;
}

export interface PublicAnnotation {
  version: number;
  published: boolean;
  body: unknown;
}

/** Cuenta nombrable (comparar "Topstep 50K" vs "FTMO") — ver `@tradevision/contracts` TradingAccount. */
export interface DemoTradingAccount {
  id: string;
  name: string;
  kind: "broker_synced" | "manual";
  connectedAccountId: string | null;
  profitCalcMethod: "fifo" | "lifo" | "wavg";
  currency: string;
  initialBalance: number | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface Catalog {
  id: string;
  label: string;
  scope: "global" | "custom";
}

/** Espejo en memoria de `trade_attachments` (`@tradevision/db`). Máx. 3 por operación
 * — mismo límite que `MAX_ATTACHMENTS_PER_TRADE` del repo real, forzado también acá. */
export const MAX_ATTACHMENTS_PER_TRADE = 3;

export interface DemoAttachment {
  id: string;
  key: string;
  thumbKey: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

const g = globalThis as unknown as { __tvDemo?: DemoState };

export interface DemoState {
  user: DemoUser;
  manual: CoreTrade[];
  verified: CoreTrade[];
  notTaken: NotTaken[];
  setups: { id: string; name: string; family: string | null }[];
  emotionalStates: Catalog[];
  confluences: Catalog[];
  annotations: Map<string, Annotation>; // key: `${book}:${tradeId}`
  publicAnnotations: Map<string, PublicAnnotation[]>; // key: verifiedTradeId
  tradingAccounts: DemoTradingAccount[];
  attachments: Map<string, DemoAttachment[]>; // key: `${book}:${tradeId}`
}

function seed(): DemoState {
  const now = Date.UTC(2026, 5, 20, 14, 0, 0);
  const mk = (i: number, win: boolean): CoreTrade => {
    const r = win ? 1.8 : -1;
    const opened = new Date(now - i * 86_400_000);
    return {
      id: randomUUID(),
      book: "verified",
      instrument: ["EURUSD", "GBPUSD", "US30", "XAUUSD"][i % 4]!,
      side: win ? "long" : "short",
      volume: 1,
      entryPrice: 1.1,
      exitPrice: win ? 1.12 : 1.09,
      openedAt: opened.toISOString(),
      closedAt: new Date(opened.getTime() + 90 * 60_000).toISOString(),
      commission: -2,
      swap: 0,
      pnlCurrency: r * 100,
      pnlR: r,
      verified: true,
    };
  };

  return {
    user: {
      id: "demo-user",
      handle: "leonardo",
      tier: "mentor",
      delayWindowDays: 3,
      publicProfileLevel: "metrics",
    },
    manual: (() => {
      // ~3 semanas de operaciones manuales sintéticas para poblar el Diario.
      const instruments = ["NAS100", "EURUSD", "US30", "XAUUSD", "GBPJPY"];
      const pattern = [1.2, -1, 2.1, -1, -1, 1.6, 0.8, -1, 1.4, 2.4, -1, 1.1];
      return pattern.map((r, i): CoreTrade => {
        const opened = now - (20 - i) * 86_400_000 + (i % 3) * 5_400_000;
        return {
          id: randomUUID(),
          book: "manual",
          instrument: instruments[i % instruments.length]!,
          side: r >= 0 ? "long" : "short",
          volume: 0.5,
          entryPrice: 100,
          exitPrice: r >= 0 ? 101.2 : 99.1,
          openedAt: new Date(opened).toISOString(),
          closedAt: new Date(opened + 3_600_000 + (i % 4) * 900_000).toISOString(),
          commission: -1,
          swap: 0,
          pnlCurrency: Math.round(r * 50 * 100) / 100,
          pnlR: r,
          verified: false,
        };
      });
    })(),
    verified: Array.from({ length: 8 }, (_, i) => mk(i, i % 3 !== 0)),
    notTaken: [
      {
        id: randomUUID(),
        book: "not_taken",
        instrument: "EURUSD",
        side: "short",
        identifiedAt: new Date(now - 86_400_000).toISOString(),
        reason: "fear",
      },
    ],
    setups: [
      { id: randomUUID(), name: "FVG + CHoCH", family: "SMC" },
      { id: randomUUID(), name: "Silver Bullet", family: "ICT" },
      { id: randomUUID(), name: "Ruptura de rango asiático", family: "Price Action" },
    ],
    emotionalStates: ["Tranquilo", "Ansioso", "Con miedo a perder", "Eufórico", "Frustrado", "Revancha", "Duda"].map(
      (label) => ({ id: randomUUID(), label, scope: "global" as const }),
    ),
    confluences: ["FVG", "Order Block", "Liquidez tomada", "CHoCH", "BOS", "Nivel diario/semanal"].map((label) => ({
      id: randomUUID(),
      label,
      scope: "global" as const,
    })),
    annotations: new Map(),
    publicAnnotations: new Map(),
    attachments: new Map(),
    // Sólo UNA cuenta sintética: la demo no modela varias cuentas de bróker.
    // `compareTradingAccounts` en modo "vs_account" no está disponible aquí —
    // necesita BD real (ver lib/data.ts).
    tradingAccounts: [
      {
        id: "demo-account",
        name: "Cuenta demo",
        kind: "manual",
        connectedAccountId: null,
        profitCalcMethod: "fifo",
        currency: "USD",
        initialBalance: null,
        archivedAt: null,
        createdAt: new Date(now - 30 * 86_400_000).toISOString(),
      },
    ],
  };
}

export function demo(): DemoState {
  if (!g.__tvDemo) g.__tvDemo = seed();
  return g.__tvDemo;
}

export function findCore(s: DemoState, book: TradeBook, id: string) {
  if (book === "manual") return s.manual.find((t) => t.id === id) ?? null;
  if (book === "verified") return s.verified.find((t) => t.id === id) ?? null;
  return s.notTaken.find((t) => t.id === id) ?? null;
}
