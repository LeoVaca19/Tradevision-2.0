# API_CONTRACT.md — contrato vigente en tradevision-v2

> **Estado (actualizado al cerrar el Bloque 8): implementado y verificado.** Todo lo que
> describe este documento existe hoy en `tradevision-v2` con esta firma — Server Actions,
> Route Handlers y fachada de datos migrados (Bloque 8) contra los repos reales del Bloque 5
> y probados contra Supabase real. Las funciones de la fachada (§3) devuelven la forma de fila
> de `packages/db` (números ya convertidos de `numeric`→`number`, ver
> `packages/db/src/numeric.ts`), no necesariamente la forma exacta de `@tradevision/contracts`
> — esa reconciliación es trabajo del Bloque 9 (UI) cuando construya cada página.
>
> Lo único que NO existe todavía: las páginas que consumen esto (Bloque 9, sin empezar) y
> cualquier endpoint de Mentor IA (Bloque 7, pausado sin API key — ver `docs/STATUS.md`).
>
> "Backend" en este proyecto no es un servidor HTTP tradicional: son tres capas dentro de
> `apps/web` (Server Actions, Route Handlers, y una fachada de datos sin HTTP). Ver
> `MIGRATION_PLAN.md` para la estructura de carpetas y `docs/STATUS.md` para el estado por área.

---

## 1. Route Handlers (HTTP real)

| Método | Ruta | Auth | Request | Respuestas | Qué hace |
|---|---|---|---|---|---|
| `POST` | `/api/uploads` | `getCurrentUser()` → 401 si falla | JSON `{ mime: string, size: number }` | `200 { key, uploadUrl, expiresInSeconds }` · `400 { error }` body inválido · `422 { error }` mime ∉ {image/png,image/jpeg,image/webp} o size > 10MB · `503 { error }` storage no configurado | Paso 1 de subida de capturas de gráfico. Firma una URL de subida (Supabase Storage si hay `SUPABASE_SERVICE_ROLE_KEY`, si no Cloudflare R2 si hay `R2_*`, si no 503). El cliente hace `PUT uploadUrl` con el fichero. |
| `GET` | `/api/uploads/:key` | `getCurrentUser()` → 401 si falla | — | `307` redirect a GET firmado (10 min) · `403 { error }` la key no pertenece al usuario (`trades/<userId>/…`) · `503 { error }` storage no configurado | Paso 2: sirve la imagen ya subida vía redirect a una URL firmada de lectura temporal (nunca URL pública sin firmar). |

## 2. Server Actions (`"use server"`, llamadas directas desde componentes cliente — no son HTTP)

| Acción | Firma | Éxito | Fallo | Notas |
|---|---|---|---|---|
| `createManualTradeAction` | `(prevState, formData: FormData) → { ok:false, error }` (éxito no retorna) | `redirect('/trades/manual/<id>')` | `{ ok:false, error }` en validación Zod | `FormData`: instrument, side, volume, entryPrice, exitPrice, openedAt, closedAt, commission, swap, pnlCurrency, pnlR. Usada con `useActionState`. |
| `saveAnnotationAction` | `({ book, tradeId, props: TradeAnnotationProps }) → { ok:true }` | — | lanza si el Zod falla | Escribe SOLO `trade_annotations` y joins — nunca toca la operación núcleo (invariante FR-9). |
| `saveJournalNoteAction` | `({ book, tradeId, journalNote }) → { ok:true }` | — | lanza | Escribe SOLO el campo del diario; no debe pisar `props` guardadas en paralelo (bug conocido del proyecto antiguo, ver MIGRATION_PLAN.md). |
| `savePublicAnnotationAction` | `({ verifiedTradeId, body, publish: boolean }) → { ok:true, version, published } \| { ok:false, error }` | — | `{ ok:false }` si `tier !== "mentor"` | Crea SIEMPRE una versión nueva; nunca reescribe una existente. |
| `loadPublicAnnotationAction` | `(verifiedTradeId) → { version, published, body } \| null` | — | — | Última versión de la anotación pública. |
| `createSetupAction` | `(name, family?) → { id, name, family } \| null` | — | — | Sin UI que la invoque en el proyecto antiguo. |
| `createConfluenceAction` | `(label) → Row \| null` | — | — | Sin UI en el proyecto antiguo. |
| `createEmotionalStateAction` | `(label) → Row \| null` | — | — | Sin UI en el proyecto antiguo. |
| `createTradingAccountAction` | `({ name, kind, profitCalcMethod?, currency?, initialBalance? }) → TradingAccount` | — | — | Wrapper directo de la fachada de datos. |

Convención heredada (a decidir si se mantiene): fallo esperable (validación/permisos) → `{ ok:false, error }`; fallo inesperado → lanza y lo captura el error boundary.

## 3. Fachada de datos (sin HTTP — la consumen los Server Components)

No es un endpoint pero cumple ese rol: es el único punto por el que las páginas leen datos (nunca importan el paquete de BD directo).

| Función | Firma (retorno) | Qué hace |
|---|---|---|
| `currentUser()` | `Promise<User>` | Resuelve identidad. Sin auth real en el proyecto antiguo (stub). |
| `listManualTrades()` | `Promise<CoreTrade[]>` | Libro Manual del usuario. |
| `listNotTakenTrades()` | `Promise<NotTaken[]>` | Libro de No Tomadas. |
| `listManualTradesWithAnnotationSummary()` | `Promise<ManualTradeCardSummary[]>` | Libro Manual + miniatura + flag de diario en una sola consulta (evita N+1). |
| `listCatalogs()` | `Promise<{ setups, emotionalStates, confluences }>` | Catálogos globales + custom del usuario. |
| `getTradeView(book, id)` | `Promise<TradeView \| null>` | Operación núcleo + su anotación (si existe). |
| `createManualTrade(input)` | `Promise<{ id }>` | Alta manual (`verified` forzado a `false`). |
| `upsertAnnotation(input)` | `Promise<{ annotationId }>` | Transaccional; reemplaza por completo los joins de confluencias/estados emocionales. |
| `saveJournalNote(input)` | `Promise<{ annotationId }>` | Escribe SOLO el diario. |
| `savePublicAnnotation(input)` | `Promise<{ version, published }>` | Nueva versión, gating por `tier === "mentor"`. |
| `getLatestPublicAnnotation(id)` | `Promise<{...} \| null>` | — |
| `createSetup` / `createConfluence` / `createEmotionalState` | `Promise<Row \| null>` | Altas de catálogo. |
| `getDashboardStats()` | `Promise<{ metrics, radar, planVsExecuted, engineVersion }>` | Ensambla el TradeSet y corre el motor de analítica. Solo lectura; no persiste snapshots. |
| `listTradingAccounts()` | `Promise<TradingAccount[]>` | Cuentas nombrables del usuario. |
| `createTradingAccount(input)` | `Promise<TradingAccount>` | — |
| `compareTradingAccounts(input)` | `Promise<AccountComparison>` | Corre el motor dos veces con distinto filtro forense (`vs_account` o `vs_previous_period`); no persiste ni crea un libro nuevo. |
| `getTradeExecutions(verifiedTradeId)` | `Promise<TradeExecution[]>` | Fills/deals crudos de solo lectura. **Siempre `[]` en el proyecto antiguo** — no existía el ingestor que escribiera `trade_executions` en producción (el motor puro `buildRoundTrips` sí existía y estaba probado). |

## 4. Invariantes que cualquier reimplementación debe respetar

Estas son reglas de producto (PRD/Tech Spec), no detalles de implementación — se listan aquí porque varias veces determinan la forma del contrato:

- **FR-9**: la capa de anotación (`upsertAnnotation`/`saveJournalNote`) NUNCA modifica precio, volumen, tiempos o resultado de la operación.
- **FR-10**: una operación del Libro Manual nunca puede quedar marcada como verificada.
- **Append-only del Libro Verificado**: una operación verificada no se edita ni se borra; una corrección es un evento compensatorio (fila nueva).
- **FR-38**: los estados emocionales y las observaciones del Mentor IA son privados — nunca se exponen en el Perfil Público.
- **FR-64**: la anotación pública solo la puede publicar un usuario `tier === "mentor"`, y solo versiona hacia adelante (nunca reescribe una versión existente).
- **Mentor IA**: nunca escribe en `verified_trades` ni en ninguna Estadística Verificada.

## 5. Lo que NO existía como endpoint en el proyecto antiguo (y por qué importa para el orden de migración)

- **Sin backend HTTP tradicional ni tRPC** — el Tech Spec pedía tRPC; la implementación real usó Server Actions. Discrepancia sin resolver, ver `MIGRATION_PLAN.md`.
- **Sin auth real** — Tech Spec pedía Clerk; `getCurrentUser()` era un stub. Discrepancia sin resolver.
- **Sin endpoint de importación CSV** — el parser (`parseTradesCsv`) existía y estaba probado, pero no había ruta que lo invocara.
- **Sin job/endpoint de sync de bróker** — el motor de reconstrucción (`buildRoundTrips`) existía y estaba probado; el cliente HTTP de MetaApi era un stub que siempre lanzaba.
- **Sin endpoint del Mentor IA** — el contrato (`MentorAnalysisType`, lista cerrada) y el normalizador de respuesta existían; el cliente que llama a la API de Claude era un stub que siempre lanzaba.
