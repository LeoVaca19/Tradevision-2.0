# STATUS.md — Estado de la migración a tradevision-v2

> Escrito al cerrar la sesión de migración (Fase 2 del `MIGRATION_PLAN.md`), en el punto en
> que el trabajo se reparte en sesiones por área. Cada sesión nueva: leé la sección de tu
> área primero, después "Pendientes para otras áreas" para no pisar trabajo ajeno.
>
> Convención de sesiones (sin mover archivos, el repo sigue siendo un monorepo pnpm/Turborepo):
>
> ```bash
> cd "tradevision-v2/apps/web" && claude --add-dir ../../packages --add-dir ../../docs   # Frontend
> cd "tradevision-v2/packages/db" && claude --add-dir ../integrations --add-dir ../../docs # Backend
> cd "tradevision-v2/packages/mentor" && claude --add-dir ../../docs                       # IA Mentor (crear el paquete es el primer paso)
> cd "tradevision-v2" && claude                                                            # QA — ve todo, corre build/lint/typecheck/test de conjunto
> ```

---

## Frontend (`apps/web`)

**Hecho:**
- `lib/data.ts` — fachada de datos completa (conmuta `USING_REAL_DB` entre `demo-store.ts` en memoria y los repos reales de `@tradevision/db`).
- `lib/demo-store.ts` + `lib/demo-data.ts` — modo demo en memoria, conservado a propósito.
- `lib/auth.ts` (stub), `lib/journal.ts`, `lib/trade-view.ts` — helpers de presentación.
- `app/trades/actions.ts` — las 8 Server Actions (alta manual, anotaciones, diario, anotación pública, catálogos, cuentas).
- `app/api/uploads/route.ts` + `[key]/route.ts` — subida/lectura de capturas, verificadas con curl contra el servidor real (503/422/400/403 según el caso).
- **Dirección visual confirmada** (charla completa, no repetir): se lleva el sistema "diario editorial sobre parchment" del proyecto antiguo (inspirado en Flatfile), reescrito limpio sobre los tokens del Bloque 2. Solo modo claro. Inter (400/500) únicamente — Source Serif 4 NO se carga hasta que una pantalla real la necesite. Accent "Midnight Ink" casi negro, parchment restringido al hero, pills sin sombra, números financieros en monoespaciada, Radar Score como SVG real en tono Declarado (sin librería — ver `../../tradevision/components/dashboard/RadarChart.tsx` como referencia de cómo se hizo, no copiar tal cual).
- **Bloque 9 completo (UI):** las 6 páginas construidas y verificadas en el navegador real (visual + responsive mobile + flujos de escritura) contra el modo demo: landing (`/`), `/dashboard` (métricas + Radar Score SVG + Plan vs Ejecutado), `/trades` (resumen + curva de equity + calendario + toggle Galería/Tabla con preferencia en `localStorage` + Libro de No Tomadas), `/trades/new` (alta manual con `useActionState`), `/trades/:book/:id` (ficha: `PropertiesPanel` con chips de confluencias/estados emocionales + diario BlockNote con autoguardado + anotación pública BlockNote sólo para tier Mentor en Libro Verificado — dos ciclos de autoguardado desacoplados, confirmado FR-9), `/[handle]` (Perfil Público con gating real por `publicProfileLevel`, honesto: sin listado de operaciones porque `lib/data.ts` no expone ese facade todavía, no se inventó). `apps/web/app/not-found.tsx` propio (el 404 por defecto de Next ignora `color-scheme:light`). `@blocknote/*` y `@mantine/*` instalados y confirmados en las versiones ya fijadas (`0.45.0` / `^8.3.4`).
- `apps/web/app/globals.css` — capa de skin "parchment/ink" nueva, sin Source Serif 4 (sólo Inter vía `next/font/google`, pesos 400/500).
- `apps/web/lib/format.ts` (nuevo) — formato compartido de dinero/fecha/etiquetas de métricas y ejes del Radar.

**Falta (fuera de alcance del Bloque 9, a propósito):**
- **Capturas (hasta 3 por operación) — ciclo completo verificado (2026-09-25)** contra Supabase Storage real y BD real con sesión: subir → miniatura → recargar → Galería del Diario (pinta la primera captura) → borrar (con confirmación), más el aviso al pasarse del límite de 3. `TradeAttachments` en la ficha y `lib/upload-image.ts` (firmar → PUT → `key`; las keys se codifican con `encodeURIComponent` porque llevan `/`). Al borrar se quita el registro de `trade_attachments` pero el archivo queda en el bucket (huérfano); limpiarlo es tarea de Backend/mantenimiento, no del frontend. Pendiente menor: la Galería no tiene fallback si una imagen no carga (sólo pasa con storage caído).
- `/trades/compare` y `AccountBar` (cuentas nombrables) — no estaban en la lista de páginas del Bloque 9; `lib/data.ts` ya tiene `listTradingAccounts`/`compareTradingAccounts` listos para cuando se pida esa UI.
- Perfil Público nivel "detail": falta un facade `listVerifiedTrades()` (no existe hoy) para el detalle de operaciones — documentado en la propia página, no se fabricó un listado.

**Bloqueos:** ninguno técnico.

---

## Backend (`packages/db`, `packages/integrations`)

**Hecho:**
- Esquema nuevo (18 tablas, `numeric` para dinero, invariantes de negocio preservadas: trigger append-only, los 3 CHECK, RLS) — aplicado y verificado contra la Supabase real del proyecto (`htezajywbjautjioxvzw`), 0 advisories de seguridad/performance pendientes.
- `client.ts` (conexión perezosa, sin PGlite) + los 5 repositorios (`trades`, `catalogs`, `users`, `stats`, `accounts`) con conversión `numeric`↔`number` en el borde — probados contra Supabase real, no solo typecheck.
- `packages/integrations` completo salvo Mentor IA: `round-trips.ts` (motor de reconstrucción por fills), `csv-import.ts`, `storage.ts`, `r2.ts`, `metaapi.ts` (lógica de normalización real; el cliente HTTP sigue stub, sin `METAAPI_TOKEN`). `csv-import.ts`: corregido un fabricado silencioso — `commission`/`swap` ilegibles (no vacíos) ya no se convertían en `0`, ahora la fila se marca fallida (test de regresión agregado).
- **Materialización de `stat_snapshots` resuelta:** `materializeStatSnapshots(db, userId, opts)` en `packages/db/src/repositories/stats.ts` — compone `loadTradeSet` → `compute`/`computeRadarScore` (`@tradevision/engine`, nueva dependencia de `packages/db`) → `saveStatSnapshots`. Es el CUERPO invocable que faltaba; no incluye el job Inngest en sí (infra ausente, ver "Falta" e Inngest más abajo — fuera de alcance de `packages/db`/`integrations`). Probado extremo a extremo contra Supabase real vía `pnpm --filter @tradevision/db materialize-stats [handle]` (script nuevo, `src/materialize-stats.ts`): 15 filas insertadas (8 métricas + 6 ejes + compuesto), `sealed`/`book` correctos, sin violar los CHECK. Con el usuario dev actual (0 operaciones verificadas) todo sale `insufficient_data` — no se fabricaron datos para forzar un resultado con valor.
- **`trade_attachments` persistido — CONTRATO PARA FRONTEND:** la tabla existía en el esquema pero nada la usaba (ni en v1 ni acá); además, `listManualTradesWithAnnotationSummary` derivaba `firstAttachmentKey` de `trade_annotations.extra.attachments`, un JSON ad-hoc que nunca llegó a poblarse — **retirado**, ahora lee de `trade_attachments` real. Si algo en el frontend asumía `extra.attachments`, ya no aplica.
  - **Repo** (`packages/db/src/repositories/attachments.ts`): `createAttachment(db, userId, { book, tradeId, key, thumbKey?, mime, size, width?, height? }): Promise<Attachment>`, `listAttachments(db, userId, { book, tradeId }): Promise<Attachment[]>`, `deleteAttachment(db, userId, id): Promise<void>`. `MAX_ATTACHMENTS_PER_TRADE = 3` forzado en `createAttachment` (transaccional). `createAttachment` crea la anotación vacía sola si la operación todavía no tenía una — no hace falta llamar `upsertAnnotation` antes.
  - **Fachada** (`apps/web/lib/data.ts`, mismo patrón `USING_REAL_DB`/demo-store que el resto): `listAttachments(book, tradeId): Promise<TradeAttachment[]>`, `createAttachment(input: NewAttachment): Promise<TradeAttachment>`, `deleteAttachment({ id, book, tradeId }): Promise<void>`. `TradeAttachment = { id, key, thumbKey, mime, size, width, height, createdAt: string }` (sin `annotationId`, el frontend siempre opera por `book`+`tradeId`). Modo demo: `demo-store.ts` gana un `Map<string, DemoAttachment[]>` (`attachments`, key `` `${book}:${tradeId}` ``) con el mismo límite de 3.
  - **Server Actions** (`apps/web/app/trades/actions.ts`): `createAttachmentAction(input)` / `deleteAttachmentAction({ id, book, tradeId })` devuelven `{ ok:false, error }` en el caso esperable (límite de 3, no-propietario) — no lanzan; `listAttachmentsAction(book, tradeId)` es un passthrough directo. El cliente sube el fichero primero (`POST /api/uploads` → `PUT` al storage, Bloque 8, ya probado) y recién después llama `createAttachmentAction` con la `key` resultante — estas acciones no tocan el storage, sólo persisten qué `key` quedó asociada a qué operación.
  - Probado extremo a extremo contra Supabase real (repo): alta sin anotación previa, 4to adjunto rechazado, `listAttachments`/`deleteAttachment` de otro usuario no filtran ni borran nada ajeno, cascada correcta al borrar la operación. Sin cambios de esquema (la tabla ya existía) — no aplica `get_advisors`.

**Falta:**
- Cliente real de MetaApi (bloqueado por credenciales — ver Bloqueos).
- Endpoint/UI de importación CSV (el parser ya existe y está probado, falta la ruta que lo invoque). Nota: tampoco existe todavía en `packages/db` una función que persista un lote parseado (insertar `manual_trades` + fila en `import_batches`) — hoy sólo hay `createManualTrade` operación por operación; evaluar si hace falta un batch al construir esa ruta.
- Job de sync que llame a `normalizeClosedPositions` y persista `verified_trades`/`trade_executions` — no existe todavía (tampoco existía en el proyecto antiguo).
- Job Inngest que dispare `materializeStatSnapshots` (nueva, ver arriba) cuando corresponda (nueva sincronización, sube `ENGINE_VERSION`, cambian filtros guardados — Tech Spec §7). La función ya existe y está probada; falta la infraestructura de jobs en sí.
- Sin jobs asíncronos (Inngest) — gap heredado, nunca se construyó en el proyecto antiguo tampoco.

### Auth (Supabase Auth) — contrato

**Migración `0002_auth_link_and_policies.sql`** (aplicada a Supabase real vía `pnpm db:setup`, 2026-09-23): trigger `on_auth_user_created` en `auth.users` → crea la fila en `public.users` (`auth_provider_id = auth.users.id::text`, `handle = <local-part>-<4 hex del id>`, `tier = free`); función `current_app_user_id()`; policy `own_rows` (FOR ALL, `authenticated`) en las 11 tablas con `user_id` + `own_row` (SELECT) en `users`. **Son defensa en profundidad:** la app conecta como `postgres` (bypass de RLS) y los grants a `anon`/`authenticated` siguen revocados (`rls.sql`); el aislamiento efectivo hoy es el `userId` de la sesión en cada repositorio. Advisors tras aplicar: security = 6 INFO `rls_enabled_no_policy` (tablas hijas/catálogos, deny-all intencional, ya existían) + 1 WARN `authenticated_security_definer_function_executable` en `current_app_user_id()` (aceptado: sólo devuelve el id del propio llamador y las policies lo necesitan); performance = sólo `unused_index` INFO.

**API (`@tradevision/db`):**
- `supabaseEnv(): { url, anonKey } | null` — lee `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `SUPABASE_URL`/`SUPABASE_ANON_KEY`).
- `createSupabaseServerClient(cookies: CookieMethodsServer): SupabaseClient` — cookies inyectadas (el paquete no depende de Next). Sólo anon key; la service role no se usa.
- `getSessionUser(supabase, db): Promise<SessionUser | null>` — usa `auth.getUser()` (valida el JWT; NO `getSession()`); `SessionUser = UserBasics & { email }` = `{ id, handle, email, tier, delayWindowDays, publicProfileLevel }`; `null` sin sesión o si falta la fila.

**Ejemplo mínimo (Next, ver `apps/web/lib/supabase-server.ts`):**
```ts
const db = await import("@tradevision/db");
const store = await cookies(); // next/headers
const supabase = db.createSupabaseServerClient({
  getAll: () => store.getAll(),
  setAll: (l) => { try { l.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
});
const user = await db.getSessionUser(supabase, await db.getDb()); // SessionUser | null
```

**Entorno:** `DATABASE_URL` (web: pooler 6543; `packages/db/.env`: 5432 para migraciones), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Nunca la service role en el cliente. Aviso de shell: la contraseña de `DATABASE_URL` puede contener `$`; NO hacer `source .env` (el shell la expande y rompe la URL) — usar `node --env-file=...` o los loaders propios (`setup.ts`).

**`getFirstUser`** queda sólo para scripts de dev (`materialize-stats`); la ruta real de la web ya no lo usa (ni `DEV_USER_ID`).

**Frontend/Auth (mismo trabajo):** `apps/web/middleware.ts` (refresca sesión; redirige `/dashboard` y `/trades/**` → `/login`; `/login` con sesión → `/dashboard`; `/api/*` responde 401 por sí mismo), `app/login` (`authAction` única con campo `mode`), `lib/data.ts` → `currentUserOrNull()`/`currentUser()` (lanza sin sesión) sólo en la rama `USING_REAL_DB`; el modo demo queda igual.

**Supabase Auth requiere "Confirm email" desactivado para probar rápido:** hoy está ACTIVO en el proyecto (el alta no deja sesión hasta el clic; además el SMTP por defecto limita los correos: `email rate limit exceeded`). Site URL / Redirect URLs deben ser `http://localhost:3100`.

**Bloqueos:** `METAAPI_TOKEN` no configurado — sin eso, el cliente real de MetaApi no se puede construir más allá del stub actual.

---

## IA Mentor (`packages/mentor` — el paquete todavía no existe)

**Hecho:**
- El contrato ya está listo en `@tradevision/contracts` (Bloque 1): `MentorAnalysisType` (lista cerrada), `MentorAnalysisCategory`, `MentorObservation`, `MentorAnalysisResponse`, `MENTOR_ANALYSIS_CATEGORY`.
- La tabla `mentor_observations` ya existe en el esquema de BD (Bloque 4), con índice en `user_id`.
- `toMentorResponse()` (normalizador puro) está en `../../tradevision/packages/integrations/src/mentor-ia.ts` — MIGRAR tal cual, es función pura sin dependencias del cliente.

**Falta (Bloque 7 completo, pausado por decisión explícita — sin API key todavía):**
- Crear el paquete `packages/mentor` desde cero (`package.json`, `tsconfig.json`, estructura) — decidido que sea paquete propio, NO dentro de `integrations`, para que la frontera de FR-38 (Mentor nunca toca Estadística Verificada, nunca se publica) sea un límite de import verificable por typecheck: solo puede importar `@tradevision/contracts` + una interfaz de solo-lectura angosta de `db`, nunca el cliente Drizzle completo.
- Cliente real de Claude API (tool use contra `MentorToolInput`) — hoy stub, lanza siempre.
- Ensamblado del prompt/contexto, disparador, escritura a `mentor_observations`, UI, rate limiting.

**Bloqueos:** `ANTHROPIC_API_KEY` no configurada.

---

## QA

**Rol adicional: triage/ruteo.** Leonardo prueba la app desde esta sesión y describe acá
bugs o cambios que quiere. Esta sesión no los implementa — diagnostica a qué área
pertenecen (Frontend/Backend/IA Mentor, o "cross" si toca más de una) y devuelve un
prompt listo para pegar en la sesión correspondiente, con el síntoma observado, el/los
archivo(s) probables y el resultado esperado. Ver el prompt de arranque de esta sesión
para el formato exacto.

**Hecho:**
- Cada bloque cerrado con `typecheck`/`build`/`lint`/`test` en verde antes de commitear. Estado actual del monorepo: `typecheck` 12/12, `build` 7/7, `lint` 11/11, `test` 48/48 (25 `engine` + 23 `integrations`).
- Verificación real contra Supabase (no solo mocks) en los bloques de BD: `db:setup` idempotente, advisories de seguridad/performance revisados con `mcp__supabase__get_advisors` y en cero.
- Verificación real de HTTP en Bloque 8: servidor de dev corriendo + `curl` contra las rutas de `/api/uploads`.

**Falta:**
- Sin tests de `apps/web` (páginas, fachada, Server Actions) ni E2E — mismo gap que tenía el proyecto antiguo, nunca resuelto.
- Accesibilidad del Bloque 9 (lectores de pantalla, navegación por teclado a fondo) sin auditar todavía — sólo se verificó visual + responsive + flujos de escritura en el navegador real.
- `pnpm --filter @tradevision/web lint` usa `next lint` (ESLint 8) — validado en verde con las páginas/componentes reales del Bloque 9; seguir vigilando a medida que se agreguen más.

**Bloqueos:** ninguno.

---

## Pendientes para otras áreas (transversal, no es de ningún paquete en particular)

- **Rotar la contraseña de Supabase del proyecto ANTIGUO** (`tradevision/`, ref `ppasceqbpmazadqmnhhq`) — quedó escrita en un historial de chat de una sesión anterior, nunca se confirmó que se haya rotado. No bloquea a `tradevision-v2` (usa un proyecto Supabase distinto) pero sigue siendo una credencial viva expuesta. Acción de Leonardo, fuera del alcance de cualquier sesión de código.
- **Auth real (Clerk vs Supabase Auth)**: decidido posponer (Bloque 1). Cuando se retome, es una decisión transversal que toca Frontend (`lib/auth.ts`, `getCurrentUser()`) y Backend (`users.auth_provider_id`) a la vez — coordinar antes de tocarlo desde una sola área.
- **`apps/parser-py`**: fuera de alcance de esta migración (decidido, Bloque 1). Si se retoma, es una app nueva, no encaja en ninguna de las 3 áreas de arriba tal cual están definidas.
- **`MIGRATION_PLAN.md`** sigue siendo la fuente de verdad de qué se migró de dónde y por qué — cualquier sesión que necesite entender una decisión de diseño de esquema/contrato/motor debería mirarlo antes de re-derivarla.
