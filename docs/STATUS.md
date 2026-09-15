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

**Falta (Bloque 9, no empezado):**
- Todas las páginas: landing (`/`), dashboard (`/dashboard`), diario (`/trades`, con toggle Galería/Tabla), alta manual (`/trades/new`), ficha del trade (`/trades/:book/:id` — propiedades + diario + anotación pública), Perfil Público (`/[handle]`, hoy sin ninguna lógica).
- Todos los componentes: `StatBadge`, `MetricCard`, `RadarChart`, editores BlockNote (`TradeJournalEditor`, `PublicAnnotationEditor`, wrapper `next/dynamic`), `PropertiesPanel`, formulario de alta, tarjetas de galería, calendario, curva de equity, nav.
- `apps/web/app/globals.css` — la capa de skin "parchment/ink" nueva (la vieja está en `../../tradevision/apps/web/app/globals.css` como referencia).
- Dependencias que faltan en `package.json`: `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@mantine/core`, `@mantine/hooks` (todas ya en `pnpm.overrides` de la raíz, pero no instaladas en este paquete todavía).

**Bloqueos:** ninguno técnico — listo para arrancar.

---

## Backend (`packages/db`, `packages/integrations`)

**Hecho:**
- Esquema nuevo (18 tablas, `numeric` para dinero, invariantes de negocio preservadas: trigger append-only, los 3 CHECK, RLS) — aplicado y verificado contra la Supabase real del proyecto (`htezajywbjautjioxvzw`), 0 advisories de seguridad/performance pendientes.
- `client.ts` (conexión perezosa, sin PGlite) + los 5 repositorios (`trades`, `catalogs`, `users`, `stats`, `accounts`) con conversión `numeric`↔`number` en el borde — probados contra Supabase real, no solo typecheck.
- `packages/integrations` completo salvo Mentor IA: `round-trips.ts` (motor de reconstrucción por fills), `csv-import.ts`, `storage.ts`, `r2.ts`, `metaapi.ts` (lógica de normalización real; el cliente HTTP sigue stub, sin `METAAPI_TOKEN`).

**Falta:**
- Cliente real de MetaApi (bloqueado por credenciales — ver Bloqueos).
- Endpoint/UI de importación CSV (el parser ya existe y está probado, falta la ruta que lo invoque).
- Job de sync que llame a `normalizeClosedPositions` y persista `verified_trades`/`trade_executions` — no existe todavía (tampoco existía en el proyecto antiguo).
- Materialización de `stat_snapshots` (el puente `loadTradeSet`/`saveStatSnapshots` ya existe y está probado; falta qué lo invoque — endpoint, página o job).
- Sin jobs asíncronos (Inngest) — gap heredado, nunca se construyó en el proyecto antiguo tampoco.

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

**Hecho:**
- Cada bloque cerrado con `typecheck`/`build`/`lint`/`test` en verde antes de commitear. Estado actual del monorepo: `typecheck` 12/12, `build` 7/7, `lint` 11/11, `test` 48/48 (25 `engine` + 23 `integrations`).
- Verificación real contra Supabase (no solo mocks) en los bloques de BD: `db:setup` idempotente, advisories de seguridad/performance revisados con `mcp__supabase__get_advisors` y en cero.
- Verificación real de HTTP en Bloque 8: servidor de dev corriendo + `curl` contra las rutas de `/api/uploads`.

**Falta:**
- Sin tests de `apps/web` (páginas, fachada, Server Actions) ni E2E — mismo gap que tenía el proyecto antiguo, nunca resuelto.
- Verificar Bloque 9 en el navegador real (visual, responsive, accesibilidad) en cuanto exista.
- `pnpm --filter @tradevision/web lint` usa `next lint` (ESLint 8) — validar que siga limpio a medida que se agreguen páginas/componentes reales.

**Bloqueos:** ninguno.

---

## Pendientes para otras áreas (transversal, no es de ningún paquete en particular)

- **Rotar la contraseña de Supabase del proyecto ANTIGUO** (`tradevision/`, ref `ppasceqbpmazadqmnhhq`) — quedó escrita en un historial de chat de una sesión anterior, nunca se confirmó que se haya rotado. No bloquea a `tradevision-v2` (usa un proyecto Supabase distinto) pero sigue siendo una credencial viva expuesta. Acción de Leonardo, fuera del alcance de cualquier sesión de código.
- **Auth real (Clerk vs Supabase Auth)**: decidido posponer (Bloque 1). Cuando se retome, es una decisión transversal que toca Frontend (`lib/auth.ts`, `getCurrentUser()`) y Backend (`users.auth_provider_id`) a la vez — coordinar antes de tocarlo desde una sola área.
- **`apps/parser-py`**: fuera de alcance de esta migración (decidido, Bloque 1). Si se retoma, es una app nueva, no encaja en ninguna de las 3 áreas de arriba tal cual están definidas.
- **`MIGRATION_PLAN.md`** sigue siendo la fuente de verdad de qué se migró de dónde y por qué — cualquier sesión que necesite entender una decisión de diseño de esquema/contrato/motor debería mirarlo antes de re-derivarla.
