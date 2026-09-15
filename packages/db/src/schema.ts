import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Esquema TradeVision — la BASE DE DATOS fuerza la segregación Verificado vs
 * Declarado (Tech Spec §1.1). No se confía en la disciplina del código de
 * aplicación:
 *  - `verified_trades` es append-only (trigger en `src/sql/append_only.sql`).
 *  - `stat_snapshots` tiene un CHECK: si el libro no es 'verified', no hay Sello.
 *  - Todo lo que aporta el usuario vive en tablas anexas enlazadas por FK.
 *
 * Diseño heredado de `../../tradevision/packages/db/src/schema.ts` (mismas 18
 * tablas, mismas invariantes de negocio) pero reescrito, no copiado — ver
 * MIGRATION_PLAN.md §1.2 para el detalle de qué cambió y por qué:
 *  - Montos financieros en `numeric` en vez de `doublePrecision` (decisión de
 *    Leonardo, 2026-09-15): precisión exacta para las cifras que sostienen la
 *    promesa de "Verificado". El driver los devuelve como `string`; los
 *    repositorios (packages/db/src/repositories) son responsables de convertir
 *    a `number` en el borde hacia `@tradevision/contracts`/`@tradevision/engine`.
 *  - Nombres explícitos y cortos en todos los constraints compuestos (el
 *    proyecto anterior tenía dos truncados a 63 caracteres por Postgres,
 *    documentado sin resolver en su BACKLOG.md).
 *  - `annotation_emotional_states` / `annotation_confluences` ganan una
 *    primary key compuesta real (antes usaban un `unique()` etiquetado `pk`
 *    que no era una PK de verdad).
 *  - Índices en columnas FK que no quedaban cubiertas por ningún índice
 *    compuesto existente (regla `schema-foreign-key-indexes` de la skill de
 *    Postgres: Postgres no indexa FKs automáticamente).
 *  - `manual_trades.import_batch_id` gana su FK real (antes era un UUID
 *    suelto sin `.references()`).
 *  - `not_taken_trades.hypothetical_outcome` pasa de `text` libre al enum
 *    `trade_outcome`, igual que el resto de los campos de lista cerrada.
 *  - Primary keys siguen en UUID v4 aleatorio (decisión de Leonardo,
 *    2026-09-15): la skill de Postgres prefiere UUID v7/bigint identity por
 *    localidad de índice, pero eso importa a escala grande; migrar más
 *    adelante no rompe nada de cara al cliente (mismo formato de string).
 */

// ─────────────────────────────  Enums  ─────────────────────────────

export const userTier = pgEnum("user_tier", ["free", "mentor"]);
export const publicProfileLevel = pgEnum("public_profile_level", [
  "none",
  "summary",
  "metrics",
  "detail",
]);
export const tradeSide = pgEnum("trade_side", ["long", "short"]);
export const tradeOutcome = pgEnum("trade_outcome", ["win", "loss", "breakeven"]);
export const manualSource = pgEnum("manual_source", ["hand", "csv_import", "pdf_import"]);
export const notTakenReason = pgEnum("not_taken_reason", [
  "fear",
  "doubt",
  "missed_in_time",
  "outside_session",
  "risk_limit_reached",
  "other",
]);
export const htfBias = pgEnum("htf_bias", ["bullish", "bearish", "range", "undefined"]);
export const executionTimeframe = pgEnum("execution_timeframe", [
  "1m",
  "5m",
  "15m",
  "1H",
  "4H",
  "D",
  "W",
]);
export const marketSession = pgEnum("market_session", ["asia", "london", "ny"]);
export const checklistCompliance = pgEnum("checklist_compliance", ["in_plan", "out_of_plan"]);
export const statBook = pgEnum("stat_book", ["verified", "not_taken", "mixed"]);
export const statMetric = pgEnum("stat_metric", [
  "win_rate",
  "expectancy",
  "r_multiple_avg",
  "profit_factor",
  "max_drawdown",
  "streaks",
  "sharpe_ratio",
  "z_score",
  // Filas del Radar Score (FR-65): no son un Metric de compute(), reutilizan
  // esta misma tabla. `radar_axis` = una fila por eje (el eje va en la columna
  // `axis`); `radar_composite` = la fila del compuesto (`axis` null).
  "radar_axis",
  "radar_composite",
]);
/**
 * Ejes del Radar Score — PURO DATO CUANTITATIVO: los 6 salen del Libro
 * Verificado, nada declarado/conductual. Un score de conducta aparte
 * (`emotional_discipline`/`efficiency`) queda pendiente de construir — ver
 * `../../tradevision/PROGRESS.md` §5-quinquies para el porqué se retiraron de
 * este enum en el proyecto anterior.
 */
export const radarAxis = pgEnum("radar_axis", [
  "win_rate",
  "profit_factor",
  "avg_win_loss",
  "consistency",
  "risk_management",
  "recovery",
]);
export const mentorAnalysisCategory = pgEnum("mentor_analysis_category", ["psychological", "thesis"]);
/**
 * `broker_synced` = respaldada por una fila de `connected_accounts` (MetaApi).
 * `manual` = cuenta nombrada sin sincronización de bróker todavía (el trader
 * organiza sus operaciones manuales/no-tomadas por cuenta aunque no la haya
 * conectado). Puede pasar de `manual` a `broker_synced` enlazando después una
 * `connected_accounts` — nunca al revés.
 */
export const tradingAccountKind = pgEnum("trading_account_kind", ["broker_synced", "manual"]);
/** Método de emparejamiento de lotes del motor de round-trips (packages/integrations). */
export const profitCalcMethod = pgEnum("profit_calc_method", ["fifo", "lifo", "wavg"]);

/** Precisión común para precio/dinero: cubre FX, índices, futuros y cripto. */
const money = (name: string) => numeric(name, { precision: 20, scale: 8 });

// ─────────────────────────────  Usuario  ─────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Id externo del proveedor de auth (sin auth real todavía — decisión
   * pendiente entre Clerk/Supabase Auth, ver MIGRATION_PLAN.md §3.1; hasta
   * entonces se siembra un valor dev como "dev:leonardo"). */
  authProviderId: text("auth_provider_id").notNull().unique(),
  handle: text("handle").notNull().unique(),
  email: text("email").notNull().unique(),
  tier: userTier("tier").notNull().default("free"),
  publicProfileLevel: publicProfileLevel("public_profile_level").notNull().default("none"),
  delayWindowDays: integer("delay_window_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * `trading_accounts` — cuenta NOMBRABLE por el usuario ("Topstep 50K", "FTMO
 * Challenge"), ortogonal a los libros (Verificado/Manual/No Tomadas). Un
 * trader con varias cuentas de prop firm en simultáneo compara sus stats por
 * cuenta sin que eso toque la segregación Verificado/Declarado: las stats de
 * una cuenta `broker_synced` siguen viniendo EXCLUSIVAMENTE de
 * `verified_trades` filtradas por su `connected_account_id`. No es un libro
 * nuevo ni cambia el trigger append-only.
 */
export const tradingAccounts = pgTable(
  "trading_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: tradingAccountKind("kind").notNull(),
    /** Cómo el motor de round-trips empareja lotes al reconstruir esta cuenta. */
    profitCalcMethod: profitCalcMethod("profit_calc_method").notNull().default("fifo"),
    currency: text("currency").notNull().default("USD"),
    /** Ancla el % de drawdown y el tamaño de cuenta (contexto prop-firm). */
    initialBalance: money("initial_balance"),
    /** "Cerrar" una cuenta sin borrar su historial de operaciones/anotaciones. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("trading_accounts_user_name_uq").on(t.userId, t.name)],
);

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Cuenta nombrable a la que pertenece esta conexión de bróker (1:1).
     * Nullable sólo para no romper conexiones existentes sin backfill; en
     * altas nuevas `linkConnectedAccount`/`createTradingAccount` la deja
     * siempre informada.
     */
    tradingAccountId: uuid("trading_account_id").references(() => tradingAccounts.id, {
      onDelete: "set null",
    }),
    /** Id de cuenta en MetaApi.cloud. */
    metaApiAccountId: text("metaapi_account_id").notNull(),
    broker: text("broker"),
    server: text("server"),
    currency: text("currency").notNull().default("USD"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("connected_accounts_user_idx").on(t.userId),
    index("connected_accounts_trading_account_idx").on(t.tradingAccountId),
  ],
);

// ─────────────────────────────  Catálogos  ─────────────────────────────

export const setups = pgTable(
  "setups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Familia / estilo — catálogo abierto (FR-21 / FR-66): SMC, ICT, Price Action… */
    family: text("family"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("setups_user_name_uq").on(t.userId, t.name)],
);

export const emotionalStates = pgTable(
  "emotional_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = catálogo global; si no, custom del usuario. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
  },
  (t) => [unique("emotional_states_scope_label_uq").on(t.userId, t.label)],
);

export const confluences = pgTable(
  "confluences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
  },
  (t) => [unique("confluences_scope_label_uq").on(t.userId, t.label)],
);

// ─────────────────────────────  Importación  ─────────────────────────────
// Definida acá (antes de los libros) porque `manual_trades.import_batch_id`
// la referencia — Drizzle soporta referencias hacia adelante vía callback,
// pero el esquema original evitaba depender de eso ordenando las tablas solo
// hacia atrás; se mantiene esa misma disciplina acá.

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'csv' | 'pdf'
    filename: text("filename").notNull(),
    rowsTotal: integer("rows_total").notNull().default(0),
    rowsImported: integer("rows_imported").notNull().default(0),
    /** Filas que el parser no pudo leer: [{ row, raw, error }]. */
    rowsFailed: jsonb("rows_failed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_user_idx").on(t.userId)],
);

// ─────────────────────────  Libros (segregación §4.2)  ─────────────────────────

/**
 * LIBRO VERIFICADO — append-only. Origen: sincronización MetaApi. Datos
 * inmutables (precio, volumen, tiempos, resultado). Sin `updated_at`. El
 * trigger de `src/sql/append_only.sql` BLOQUEA UPDATE y DELETE.
 */
export const verifiedTrades = pgTable(
  "verified_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "restrict" }),
    /** Id de la posición/deal en el bróker. Idempotencia de la sincronización. */
    brokerTradeId: text("broker_trade_id").notNull(),
    instrument: text("instrument").notNull(),
    side: tradeSide("side").notNull(),
    volume: numeric("volume", { precision: 20, scale: 8 }).notNull(),
    entryPrice: money("entry_price").notNull(),
    exitPrice: money("exit_price").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    commission: money("commission").notNull().default("0"),
    swap: money("swap").notNull().default("0"),
    pnlCurrency: money("pnl_currency").notNull(),
    /** R-múltiplo: ratio derivado, no un monto — se mantiene en double precision. */
    pnlR: numeric("pnl_r", { precision: 12, scale: 6 }),
    /** Versión del mapeo bróker → tabla, para re-normalizar si cambia. */
    engineIngestVersion: text("engine_ingest_version").notNull().default("0"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("verified_trades_account_broker_uq").on(t.connectedAccountId, t.brokerTradeId),
    index("verified_user_closed_idx").on(t.userId, t.closedAt),
  ],
);

/**
 * `trade_executions` — fills/deals CRUDOS del bróker que componen una
 * operación del Libro Verificado (append-only igual que `verified_trades`,
 * mismo trigger en `src/sql/append_only.sql`). Queda vacía hasta que exista
 * el job de sync que persista sobre el motor de round-trips
 * (`packages/integrations/src/round-trips.ts`, migrado en el Bloque 6). El
 * repo `getTradeExecutions` ya queda listo devolviendo `[]` hasta entonces —
 * nunca se inventan datos.
 */
export const tradeExecutions = pgTable(
  "trade_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    verifiedTradeId: uuid("verified_trade_id")
      .notNull()
      .references(() => verifiedTrades.id, { onDelete: "cascade" }),
    /** Id del deal en el bróker. Idempotencia de la ingesta. */
    brokerDealId: text("broker_deal_id").notNull(),
    // NOTA (heredada, sin resolver — ver MIGRATION_PLAN.md §4): "long"/"short"
    // describe la OPERACIÓN, no el fill (un fill es buy/sell — puede ser
    // entrada o salida de cualquier dirección). Semánticamente debería ser un
    // enum buy/sell propio, pero ya es un contrato consumido por el frontend
    // (`TradeExecution.side` en `@tradevision/contracts`) — no se cambia sin
    // decisión explícita.
    side: tradeSide("side").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
    price: money("price").notNull(),
    fee: money("fee").notNull().default("0"),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("trade_executions_trade_deal_uq").on(t.verifiedTradeId, t.brokerDealId),
    index("trade_executions_trade_idx").on(t.verifiedTradeId, t.executedAt),
  ],
);

/**
 * LIBRO MANUAL — alta a mano o import CSV/PDF (FR-67). `verified` es SIEMPRE
 * false y no puede volverse true (CHECK). Nunca alimenta una Estadística
 * Verificada ni un Sello.
 */
export const manualTrades = pgTable(
  "manual_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Opcional: a qué cuenta nombrable pertenece (organización, comparación). */
    tradingAccountId: uuid("trading_account_id").references(() => tradingAccounts.id, {
      onDelete: "set null",
    }),
    verified: boolean("verified").notNull().default(false),
    source: manualSource("source").notNull().default("hand"),
    /** Lote de importación, para poder deshacer un CSV/PDF completo. */
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    instrument: text("instrument").notNull(),
    side: tradeSide("side").notNull(),
    volume: numeric("volume", { precision: 20, scale: 8 }).notNull(),
    entryPrice: money("entry_price").notNull(),
    exitPrice: money("exit_price").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull(),
    commission: money("commission").notNull().default("0"),
    swap: money("swap").notNull().default("0"),
    pnlCurrency: money("pnl_currency").notNull(),
    pnlR: numeric("pnl_r", { precision: 12, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("manual_never_verified", sql`${t.verified} = false`),
    index("manual_user_closed_idx").on(t.userId, t.closedAt),
    index("manual_trading_account_idx").on(t.tradingAccountId),
    index("manual_import_batch_idx").on(t.importBatchId),
  ],
);

/**
 * LIBRO DE NO TOMADAS (FR-24). Setup identificado y no ejecutado. Base del
 * contrafactual "Plan vs Ejecutado" (Cambio 5). Sin resultado real.
 */
export const notTakenTrades = pgTable(
  "not_taken_trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Opcional: a qué cuenta nombrable pertenece (organización, comparación). */
    tradingAccountId: uuid("trading_account_id").references(() => tradingAccounts.id, {
      onDelete: "set null",
    }),
    instrument: text("instrument").notNull(),
    side: tradeSide("side").notNull(),
    identifiedAt: timestamp("identified_at", { withTimezone: true }).notNull(),
    reason: notTakenReason("reason").notNull(),
    plannedEntry: money("planned_entry"),
    plannedStop: money("planned_stop"),
    plannedTarget: money("planned_target"),
    /** FR-25 (fuera del MVP): permanece null hasta que exista el estimador. */
    hypotheticalOutcome: tradeOutcome("hypothetical_outcome"),
    hypotheticalPnlR: numeric("hypothetical_pnl_r", { precision: 12, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("not_taken_user_idx").on(t.userId, t.identifiedAt),
    index("not_taken_trading_account_idx").on(t.tradingAccountId),
  ],
);

// ─────────────────  Capa de enriquecimiento (anexa, editable)  ─────────────────

/**
 * `trade_annotations` — 0..1 por operación de CUALQUIER libro. Nunca altera
 * precio/volumen/tiempos/resultado (FR-9). Guarda las propiedades tipadas del
 * registro tipo Notion (Tech Spec §6.1). Exactamente una de las tres FK de
 * libro está informada.
 */
export const tradeAnnotations = pgTable(
  "trade_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verifiedTradeId: uuid("verified_trade_id").references(() => verifiedTrades.id, {
      onDelete: "cascade",
    }),
    manualTradeId: uuid("manual_trade_id").references(() => manualTrades.id, { onDelete: "cascade" }),
    notTakenTradeId: uuid("not_taken_trade_id").references(() => notTakenTrades.id, {
      onDelete: "cascade",
    }),

    setupId: uuid("setup_id").references(() => setups.id, { onDelete: "set null" }),
    setupFamily: text("setup_family"),
    htfBias: htfBias("htf_bias"),
    executionTimeframe: executionTimeframe("execution_timeframe"),
    marketSession: marketSession("market_session"),
    checklistCompliance: checklistCompliance("checklist_compliance"),
    /**
     * Riesgo declarado por el trader sobre ESTA operación. Columnas propias
     * (no `extra`): son numéricas, se usan en cada operación seria y son
     * candidatas a alimentar ejes futuros del motor. Nunca alteran `pnlR` ya
     * guardado en el libro; son enriquecimiento, no recálculo automático.
     */
    stopLoss: money("stop_loss"),
    profitTarget: money("profit_target"),

    /** JSONB reservado para extensibilidad futura (Tech Spec §6.1). */
    extra: jsonb("extra"),

    /** Rich text privado (JSON de BlockNote). NUNCA publicable (FR-38). */
    journalNote: jsonb("journal_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "annotation_exactly_one_book",
      sql`(
        (${t.verifiedTradeId} is not null)::int
        + (${t.manualTradeId} is not null)::int
        + (${t.notTakenTradeId} is not null)::int
      ) = 1`,
    ),
    unique("trade_annotations_verified_uq").on(t.verifiedTradeId),
    unique("trade_annotations_manual_uq").on(t.manualTradeId),
    unique("trade_annotations_not_taken_uq").on(t.notTakenTradeId),
    index("trade_annotations_user_idx").on(t.userId),
    index("trade_annotations_setup_idx").on(t.setupId),
  ],
);

/**
 * Multi-select de estados emocionales por anotación. PRIVADO (FR-38).
 * Primary key compuesta real (el proyecto anterior sólo tenía un `unique()`
 * etiquetado `pk` — nunca fue una PK de verdad).
 */
export const annotationEmotionalStates = pgTable(
  "annotation_emotional_states",
  {
    // Sin `.references()` inline: los nombres de FK que Drizzle autogenera a
    // partir de columnas tan largas (`emotional_state_id` → `emotional_states.id`)
    // superan los 63 caracteres de Postgres y se truncan (mismo wart que las
    // constraints unique del proyecto anterior). Se nombran explícito abajo.
    annotationId: uuid("annotation_id").notNull(),
    emotionalStateId: uuid("emotional_state_id").notNull(),
  },
  (t) => [
    primaryKey({ name: "annotation_emo_states_pk", columns: [t.annotationId, t.emotionalStateId] }),
    foreignKey({
      name: "annotation_emo_states_annotation_fk",
      columns: [t.annotationId],
      foreignColumns: [tradeAnnotations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "annotation_emo_states_emo_state_fk",
      columns: [t.emotionalStateId],
      foreignColumns: [emotionalStates.id],
    }).onDelete("cascade"),
    // La PK compuesta ya cubre (annotationId, emotionalStateId) — este índice
    // es para la dirección inversa ("qué anotaciones tienen este estado
    // emocional"), útil para analítica agregada sobre el catálogo.
    index("annotation_emo_states_state_idx").on(t.emotionalStateId),
  ],
);

/** Multi-select de confluencias por anotación (FR-68). Misma corrección de PK. */
export const annotationConfluences = pgTable(
  "annotation_confluences",
  {
    annotationId: uuid("annotation_id")
      .notNull()
      .references(() => tradeAnnotations.id, { onDelete: "cascade" }),
    confluenceId: uuid("confluence_id")
      .notNull()
      .references(() => confluences.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ name: "annotation_confluences_pk", columns: [t.annotationId, t.confluenceId] }),
    // Misma razón que en annotation_emotional_states: dirección inversa de la PK.
    index("annotation_confluences_confluence_idx").on(t.confluenceId),
  ],
);

/** Capturas de gráfico y otros ficheros (Supabase Storage / R2). EXIF eliminado en ingesta. */
export const tradeAttachments = pgTable(
  "trade_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    annotationId: uuid("annotation_id")
      .notNull()
      .references(() => tradeAnnotations.id, { onDelete: "cascade" }),
    /** Clave en el storage. Nunca URL pública sin firmar dentro de la Ventana de Retardo. */
    key: text("key").notNull(),
    thumbKey: text("thumb_key"),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trade_attachments_annotation_idx").on(t.annotationId)],
);

/**
 * `public_annotations` — comentario didáctico redactado deliberadamente para
 * publicar (FR-64). Sólo `user.tier = 'mentor'` (gating = check de flag, sin
 * lógica de pago). Historial de ediciones visible: nunca se reescribe en
 * silencio → cada edición es una fila nueva con `version` incremental.
 */
export const publicAnnotations = pgTable(
  "public_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Sólo se adjunta a una Operación Verificada publicable. */
    verifiedTradeId: uuid("verified_trade_id")
      .notNull()
      .references(() => verifiedTrades.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    /** Rich text (JSON de BlockNote). */
    body: jsonb("body").notNull(),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("public_annotations_trade_version_uq").on(t.verifiedTradeId, t.version),
    index("public_annotations_user_idx").on(t.userId),
  ],
);

// ─────────────────────────────  Estadísticas  ─────────────────────────────

/**
 * `stat_snapshots` — resultado materializado del motor (FR-14 / FR-16 / FR-65 /
 * FR-66). CHECK de invariante: si `book != 'verified'` ⇒ `sealed = false`. El
 * Radar Score compuesto siempre `sealed = false`.
 */
export const statSnapshots = pgTable(
  "stat_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metric: statMetric("metric").notNull(),
    axis: radarAxis("axis"),
    book: statBook("book").notNull(),
    sealed: boolean("sealed").notNull(),
    /** null cuando `insufficient_data`. */
    value: numeric("value", { precision: 20, scale: 8 }),
    insufficientData: boolean("insufficient_data").notNull().default(false),
    detail: jsonb("detail"),
    sampleSize: integer("sample_size").notNull(),
    verifiedPeriodStart: timestamp("verified_period_start", { withTimezone: true }),
    verifiedPeriodEnd: timestamp("verified_period_end", { withTimezone: true }),
    engineVersion: text("engine_version").notNull(),
    /** Filtros Forenses Cruzados (FR-66). null = sin filtro. */
    filtersHash: text("filters_hash"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("snapshot_seal_only_verified", sql`${t.book} = 'verified' or ${t.sealed} = false`),
    index("snapshot_lookup_idx").on(t.userId, t.metric, t.filtersHash, t.engineVersion),
  ],
);

// ─────────────────────────────  Mentor IA  ─────────────────────────────

/**
 * Observaciones del Mentor IA (`packages/mentor`, Bloque 7). PRIVADAS, nunca
 * publicables (FR-38). `type` se guarda como `text`, no como enum de
 * Postgres: es la lista cerrada `MentorAnalysisType` de `@tradevision/contracts`
 * (Zod), y ampliar esa lista no debe requerir una migración de esquema.
 */
export const mentorObservations = pgTable(
  "mentor_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    category: mentorAnalysisCategory("category").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    note: text("note").notNull(),
    /** IDs de operaciones que sustentan la observación (trazabilidad). */
    tradeIds: jsonb("trade_ids").notNull(),
    dataScope: text("data_scope").notNull(),
    model: text("model").notNull(),
    engineVersion: text("engine_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mentor_observations_user_idx").on(t.userId)],
);
