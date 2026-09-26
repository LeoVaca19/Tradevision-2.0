import type {
  AccountComparison,
  ExitReason,
  PlanVsExecuted,
  RadarScore,
  StatResult,
  TradeAnnotationProps,
  TradeExecution,
  TradeSet,
  TradingAccount,
} from "@tradevision/contracts";
import { compute, computePlanVsExecuted, computeRadarScore, ENGINE_VERSION } from "@tradevision/engine";
import { demoTradeSet } from "@/lib/demo-data";
import {
  demo,
  findCore,
  MAX_ATTACHMENTS_PER_TRADE,
  type DemoAttachment,
  type DemoTradingAccount,
  type DemoUser,
} from "@/lib/demo-store";
import type { TradeBook } from "@/lib/trade-view";

/**
 * Fachada de acceso a datos para las páginas de registro.
 *
 *  - Con `DATABASE_URL` real → repos de `@tradevision/db` (Postgres).
 *  - Sin ella → almacén en memoria de `demo-store` para poder ver la página
 *    funcionando sin infraestructura.
 *
 * Las páginas y server actions importan SIEMPRE desde aquí, nunca de
 * `@tradevision/db` directamente.
 */

export const USING_REAL_DB =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("pglite");

// ─────────────────────────────  Usuario  ─────────────────────────────

/**
 * Usuario de la sesión de Supabase Auth (rama BD real) o el de la demo en
 * memoria. Sin sesión → `null`; `currentUser()` lanza (los Route Handlers lo
 * traducen a 401 y las páginas protegidas ya las filtra el middleware).
 */
export async function currentUserOrNull(): Promise<DemoUser | null> {
  if (!USING_REAL_DB) return demo().user;
  const db = await import("@tradevision/db");
  const { getSupabase } = await import("@/lib/supabase-server");
  return db.getSessionUser(await getSupabase(), await db.getDb());
}

export async function currentUser(): Promise<DemoUser> {
  const u = await currentUserOrNull();
  if (!u) throw new Error("No autenticado.");
  return u;
}

// ─────────────────────────────  Listados  ─────────────────────────────

export async function listManualTrades() {
  if (!USING_REAL_DB) return demo().manual;
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.listManualTrades(conn, (await currentUser()).id);
}

export interface ManualTradeCardSummary {
  id: string;
  instrument: string;
  side: "long" | "short";
  openedAt: string | Date;
  closedAt: string | Date;
  pnlCurrency: number;
  pnlR: number | null;
  firstAttachmentKey: string | null;
  hasJournalNote: boolean;
}

/**
 * Libro Manual + resumen de anotación (miniatura + si tiene diario) en una sola
 * llamada — para la vista Galería de `/trades`. Evita pedir `getTradeView` una
 * vez por operación (N+1).
 */
export async function listManualTradesWithAnnotationSummary(): Promise<ManualTradeCardSummary[]> {
  if (!USING_REAL_DB) {
    const s = demo();
    return s.manual.map((t) => {
      const ann = s.annotations.get(`manual:${t.id}`);
      const attachments = s.attachments.get(`manual:${t.id}`) ?? [];
      return {
        id: t.id,
        instrument: t.instrument,
        side: t.side,
        openedAt: t.openedAt,
        closedAt: t.closedAt,
        pnlCurrency: t.pnlCurrency,
        pnlR: t.pnlR,
        firstAttachmentKey: attachments[0]?.key ?? null,
        hasJournalNote: Array.isArray(ann?.journalNote) && ann.journalNote.length > 0,
      };
    });
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.listManualTradesWithAnnotationSummary(conn, (await currentUser()).id);
}

export async function listNotTakenTrades() {
  if (!USING_REAL_DB) return demo().notTaken;
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.listNotTakenTrades(conn, (await currentUser()).id);
}

export async function listCatalogs() {
  if (!USING_REAL_DB) {
    const s = demo();
    return { setups: s.setups, emotionalStates: s.emotionalStates, confluences: s.confluences };
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const uid = (await currentUser()).id;
  const [setups, emotionalStates, confluences] = await Promise.all([
    db.listSetups(conn, uid),
    db.listEmotionalStates(conn, uid),
    db.listConfluences(conn, uid),
  ]);
  return { setups, emotionalStates, confluences };
}

// ─────────────────────────  Lectura de una operación  ─────────────────────────

export interface TradeView {
  book: TradeBook;
  trade: Record<string, unknown>;
  annotation:
    | (Record<string, unknown> & { emotionalStateIds: string[]; confluenceIds: string[] })
    | null;
}

export async function getTradeView(book: TradeBook, id: string): Promise<TradeView | null> {
  if (!USING_REAL_DB) {
    const s = demo();
    const trade = findCore(s, book, id);
    if (!trade) return null;
    const ann = s.annotations.get(`${book}:${id}`);
    return {
      book,
      trade: trade as unknown as Record<string, unknown>,
      annotation: ann
        ? {
            ...ann,
            emotionalStateIds: ann.emotionalStateIds ?? [],
            confluenceIds: ann.confluenceIds ?? [],
          }
        : null,
    };
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.getTradeWithAnnotation(conn, (await currentUser()).id, { book, tradeId: id });
}

// ─────────────────────────────  Adjuntos (capturas)  ─────────────────────────────
// Tech Spec §6.1 / §4.6 Cambio 3. `POST /api/uploads` + `PUT` al storage (Bloque 8)
// ya suben el fichero real; estas funciones sólo registran qué `key` quedó
// asociada a qué operación. Máx. `MAX_ATTACHMENTS_PER_TRADE` por operación,
// forzado en el repo real (`@tradevision/db`) — no sólo acá.

export interface TradeAttachment {
  id: string;
  key: string;
  thumbKey: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export async function listAttachments(book: TradeBook, tradeId: string): Promise<TradeAttachment[]> {
  if (!USING_REAL_DB) {
    return demo().attachments.get(`${book}:${tradeId}`) ?? [];
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const rows = await db.listAttachments(conn, (await currentUser()).id, { book, tradeId });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    thumbKey: r.thumbKey,
    mime: r.mime,
    size: r.size,
    width: r.width,
    height: r.height,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface NewAttachment {
  book: TradeBook;
  tradeId: string;
  key: string;
  thumbKey?: string | null;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
}

export async function createAttachment(input: NewAttachment): Promise<TradeAttachment> {
  if (!USING_REAL_DB) {
    const s = demo();
    const mapKey = `${input.book}:${input.tradeId}`;
    const list = s.attachments.get(mapKey) ?? [];
    if (list.length >= MAX_ATTACHMENTS_PER_TRADE) {
      throw new Error(`Máximo ${MAX_ATTACHMENTS_PER_TRADE} capturas por operación.`);
    }
    const { randomUUID } = await import("node:crypto");
    const row: DemoAttachment = {
      id: randomUUID(),
      key: input.key,
      thumbKey: input.thumbKey ?? null,
      mime: input.mime,
      size: input.size,
      width: input.width ?? null,
      height: input.height ?? null,
      createdAt: new Date().toISOString(),
    };
    s.attachments.set(mapKey, [...list, row]);
    return row;
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const row = await db.createAttachment(conn, (await currentUser()).id, input);
  return {
    id: row.id,
    key: row.key,
    thumbKey: row.thumbKey,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteAttachment(input: { id: string; book: TradeBook; tradeId: string }): Promise<void> {
  if (!USING_REAL_DB) {
    const s = demo();
    const mapKey = `${input.book}:${input.tradeId}`;
    const list = s.attachments.get(mapKey) ?? [];
    s.attachments.set(
      mapKey,
      list.filter((a) => a.id !== input.id),
    );
    return;
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  await db.deleteAttachment(conn, (await currentUser()).id, input.id);
}

// ─────────────────────────────  Escrituras  ─────────────────────────────

export interface NewManualTrade {
  instrument: string;
  side: "long" | "short";
  volume: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: Date;
  closedAt: Date;
  commission: number;
  swap: number;
  pnlCurrency: number;
  pnlR: number | null;
  /** Cómo cerró (TP / BE / SL). Opcional: las operaciones anteriores al campo no lo tienen. */
  exitReason?: ExitReason | null;
}

export async function createManualTrade(input: NewManualTrade): Promise<{ id: string }> {
  if (!USING_REAL_DB) {
    const s = demo();
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    s.manual.unshift({
      id,
      book: "manual",
      verified: false,
      ...input,
      openedAt: input.openedAt.toISOString(),
      closedAt: input.closedAt.toISOString(),
    });
    return { id };
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const row = await db.createManualTrade(conn, (await currentUser()).id, { ...input, source: "hand" });
  return { id: row.id };
}

export async function upsertAnnotation(input: {
  book: TradeBook;
  tradeId: string;
  props: TradeAnnotationProps;
  journalNote?: unknown;
}) {
  if (!USING_REAL_DB) {
    const s = demo();
    const key = `${input.book}:${input.tradeId}`;
    const prev = s.annotations.get(key);
    s.annotations.set(key, {
      ...input.props,
      journalNote: input.journalNote !== undefined ? input.journalNote : (prev?.journalNote ?? null),
    });
    return { annotationId: key };
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.upsertAnnotation(conn, (await currentUser()).id, input);
}

/**
 * Guarda SÓLO el cuerpo del diario. No recibe `props`: así el autoguardado del
 * editor nunca pisa cambios de propiedades hechos en el panel en paralelo.
 */
export async function saveJournalNote(input: {
  book: TradeBook;
  tradeId: string;
  journalNote: unknown;
}) {
  if (!USING_REAL_DB) {
    const s = demo();
    const key = `${input.book}:${input.tradeId}`;
    const prev = s.annotations.get(key);
    s.annotations.set(key, {
      ...(prev ?? { confluenceIds: [], emotionalStateIds: [] }),
      journalNote: input.journalNote ?? null,
    });
    return { annotationId: key };
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.updateJournalNote(conn, (await currentUser()).id, input);
}

export async function savePublicAnnotation(input: {
  verifiedTradeId: string;
  body: unknown;
  publish: boolean;
}) {
  if (!USING_REAL_DB) {
    const s = demo();
    const list = s.publicAnnotations.get(input.verifiedTradeId) ?? [];
    const version = (list.at(-1)?.version ?? 0) + 1;
    list.push({ version, published: input.publish, body: input.body });
    s.publicAnnotations.set(input.verifiedTradeId, list);
    return { version, published: input.publish };
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const row = await db.savePublicAnnotationVersion(conn, (await currentUser()).id, input);
  return { version: row.version, published: row.published };
}

export async function getLatestPublicAnnotation(verifiedTradeId: string) {
  if (!USING_REAL_DB) {
    const list = demo().publicAnnotations.get(verifiedTradeId) ?? [];
    return list.at(-1) ?? null;
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const row = await db.getLatestPublicAnnotation(conn, (await currentUser()).id, verifiedTradeId);
  return row ? { version: row.version, published: row.published, body: row.body } : null;
}

export async function createSetup(name: string, family?: string | null) {
  if (!USING_REAL_DB) {
    const s = demo();
    const { randomUUID } = await import("node:crypto");
    const row = { id: randomUUID(), name, family: family ?? null };
    s.setups.push(row);
    return row;
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.createSetup(conn, (await currentUser()).id, { name, family: family ?? null });
}

export async function createConfluence(label: string) {
  if (!USING_REAL_DB) {
    const s = demo();
    const { randomUUID } = await import("node:crypto");
    const row = { id: randomUUID(), label, scope: "custom" as const };
    s.confluences.push(row);
    return row;
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.createConfluence(conn, (await currentUser()).id, label);
}

export async function createEmotionalState(label: string) {
  if (!USING_REAL_DB) {
    const s = demo();
    const { randomUUID } = await import("node:crypto");
    const row = { id: randomUUID(), label, scope: "custom" as const };
    s.emotionalStates.push(row);
    return row;
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  return db.createEmotionalState(conn, (await currentUser()).id, label);
}

// ─────────────────────────────  Estadísticas  ─────────────────────────────

export interface DashboardStats {
  metrics: StatResult[];
  radar: RadarScore;
  planVsExecuted: PlanVsExecuted;
  engineVersion: string;
}

/**
 * Ensambla el TradeSet (memoria o BD real) y corre el motor
 * (compute/computeRadarScore/computePlanVsExecuted). Misma firma en los dos
 * modos, así la página que la consume no necesita saber cuál está activo.
 *
 * De solo lectura por ahora: NO persiste en `stat_snapshots` (eso se reserva
 * para lo que deba quedar congelado con sello de versión, como el Perfil
 * Público). Si hace falta materializar, se añade después sin cambiar esta firma.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const opts = { engineVersion: ENGINE_VERSION, asOf: new Date().toISOString() };

  const set = !USING_REAL_DB
    ? demoTradeSet()
    : await (async () => {
        const db = await import("@tradevision/db");
        const conn = await db.getDb();
        return db.loadTradeSet(conn, (await currentUser()).id);
      })();

  return {
    metrics: compute(set, opts),
    radar: computeRadarScore(set, opts),
    planVsExecuted: computePlanVsExecuted(set, opts),
    engineVersion: ENGINE_VERSION,
  };
}

// ─────────────────────────────  Cuentas nombrables  ─────────────────────────────
// Comparar "Topstep 50K" vs "FTMO". `trading_accounts` es ORTOGONAL a los
// libros: las stats de una cuenta `broker_synced` siguen viniendo solo de
// `verified_trades` filtradas por su `connected_account_id` — esta capa sólo
// orquesta el motor dos veces con distinto `ForensicFilter`, no crea un libro
// nuevo.

function toTradingAccount(row: {
  id: string;
  name: string;
  kind: "broker_synced" | "manual";
  connectedAccountId: string | null;
  profitCalcMethod?: "fifo" | "lifo" | "wavg";
  currency: string;
  initialBalance: number | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
}): TradingAccount {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    connectedAccountId: row.connectedAccountId,
    profitCalcMethod: row.profitCalcMethod ?? "fifo",
    currency: row.currency,
    initialBalance: row.initialBalance,
    archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function listTradingAccounts(): Promise<TradingAccount[]> {
  if (!USING_REAL_DB) return demo().tradingAccounts.map(toTradingAccount);
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const rows = await db.listTradingAccounts(conn, (await currentUser()).id);
  return rows.map(toTradingAccount);
}

export async function createTradingAccount(input: {
  name: string;
  kind: "broker_synced" | "manual";
  profitCalcMethod?: "fifo" | "lifo" | "wavg";
  currency?: string;
  initialBalance?: number | null;
}): Promise<TradingAccount> {
  if (!USING_REAL_DB) {
    const s = demo();
    const { randomUUID } = await import("node:crypto");
    const row: DemoTradingAccount = {
      id: randomUUID(),
      name: input.name,
      kind: input.kind,
      connectedAccountId: null,
      profitCalcMethod: input.profitCalcMethod ?? "fifo",
      currency: input.currency ?? "USD",
      initialBalance: input.initialBalance ?? null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    };
    s.tradingAccounts.unshift(row);
    return toTradingAccount(row);
  }
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const row = await db.createTradingAccount(conn, (await currentUser()).id, input);
  return toTradingAccount({ ...row, connectedAccountId: null });
}

export interface CompareTradingAccountsInput {
  mode: "vs_account" | "vs_previous_period";
  accountIdA: string;
  /** Requerido si `mode === "vs_account"`. */
  accountIdB?: string;
  /** Requeridos si `mode === "vs_previous_period"` (define el largo de la ventana). */
  periodStart?: string;
  periodEnd?: string;
}

/** Filtra localmente en vez de pedirle al motor que filtre una cuenta sin `connected_account_id`. */
function sideTradeSet(full: TradeSet, connectedAccountId: string | null): TradeSet {
  if (connectedAccountId) return full;
  // Cuenta `manual` (aún no enlazada a un bróker): cero verificadas por
  // definición, honesto en vez de dejar pasar el libro completo sin filtrar.
  return { ...full, verified: [] };
}

export async function compareTradingAccounts(input: CompareTradingAccountsInput): Promise<AccountComparison> {
  const accounts = await listTradingAccounts();
  const findAccount = (id: string): TradingAccount => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) throw new Error(`Cuenta ${id} no encontrada.`);
    return acc;
  };

  const accountA = findAccount(input.accountIdA);
  let accountB: TradingAccount;
  let periodA: { start: string | null; end: string | null };
  let periodB: { start: string | null; end: string | null };

  if (input.mode === "vs_account") {
    if (!input.accountIdB) throw new Error('"vs_account" requiere accountIdB.');
    if (!USING_REAL_DB) {
      throw new Error(
        'Comparar dos cuentas necesita BD real: el modo demo sólo tiene una cuenta sintética ("Cuenta demo"). Usa mode:"vs_previous_period".',
      );
    }
    accountB = findAccount(input.accountIdB);
    periodA = { start: input.periodStart ?? null, end: input.periodEnd ?? null };
    periodB = periodA;
  } else {
    if (!input.periodStart || !input.periodEnd) {
      throw new Error('"vs_previous_period" requiere periodStart y periodEnd.');
    }
    accountB = accountA;
    const start = new Date(input.periodStart).getTime();
    const end = new Date(input.periodEnd).getTime();
    const span = end - start;
    periodA = { start: input.periodStart, end: input.periodEnd };
    periodB = { start: new Date(start - span).toISOString(), end: input.periodStart };
  }

  const set: TradeSet = !USING_REAL_DB
    ? demoTradeSet()
    : await (async () => {
        const db = await import("@tradevision/db");
        const conn = await db.getDb();
        return db.loadTradeSet(conn, (await currentUser()).id);
      })();

  const runSide = (account: TradingAccount, period: { start: string | null; end: string | null }) => {
    const opts = {
      engineVersion: ENGINE_VERSION,
      asOf: new Date().toISOString(),
      filter: {
        periodStart: period.start ?? undefined,
        periodEnd: period.end ?? undefined,
        connectedAccountIds: account.connectedAccountId ? [account.connectedAccountId] : undefined,
      },
    };
    const scoped = sideTradeSet(set, account.connectedAccountId);
    return {
      accountId: account.id,
      accountName: account.name,
      periodStart: period.start,
      periodEnd: period.end,
      metrics: compute(scoped, opts),
      radar: computeRadarScore(scoped, opts),
    };
  };

  return {
    mode: input.mode,
    a: runSide(accountA, periodA),
    b: runSide(accountB, periodB),
    engineVersion: ENGINE_VERSION,
  };
}

// ─────────────────────────────  Fills de bróker (sólo lectura)  ─────────────────────────────
// HOY SIEMPRE VACÍA: no existe todavía el motor de sync que persista fills en
// `trade_executions` (el motor de reconstrucción por fills sí existe —
// `packages/integrations/src/round-trips.ts`, Bloque 6). El contrato y la
// fachada quedan listos para cuando exista; nunca se inventan datos mientras
// tanto.

export async function getTradeExecutions(verifiedTradeId: string): Promise<TradeExecution[]> {
  if (!USING_REAL_DB) return [];
  const db = await import("@tradevision/db");
  const conn = await db.getDb();
  const rows = await db.getTradeExecutions(conn, (await currentUser()).id, verifiedTradeId);
  return rows.map((r) => ({
    id: r.id,
    verifiedTradeId: r.verifiedTradeId,
    brokerDealId: r.brokerDealId,
    side: r.side,
    quantity: r.quantity,
    price: r.price,
    fee: r.fee,
    executedAt: new Date(r.executedAt).toISOString(),
  }));
}
