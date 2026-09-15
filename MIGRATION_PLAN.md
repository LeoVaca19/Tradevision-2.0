# MIGRATION_PLAN.md — Auditoría del proyecto antiguo y plan de migración a v2

> **Fase 1 (auditoría) completa. Esto es un plan, no una ejecución.** Nada de `tradevision-v2`
> fuera de este archivo y `docs/API_CONTRACT.md` se tocó para producirlo. `../tradevision/` no se
> modificó — es de solo lectura.
>
> Fuente de verdad consultada: `.claude/skills/tradevision-project-context/SKILL.md`,
> `../tradevision/CLAUDE.md`, `../tradevision/PROGRESS.md`, `../tradevision/BACKLOG.md`, el árbol
> completo de archivos de `../tradevision/` y su historial de git completo (`git log --all`, sin
> ramas ni stashes adicionales).

---

## Resumen ejecutivo (léelo primero)

1. **El código committeado de `tradevision/` está limpio.** No encontré evidencia de "código
   basura" del bucle en git (17 commits, todos con mensajes descriptivos y alcance coherente;
   working tree limpio salvo `BACKLOG.md` sin trackear). No hay clientes duplicados de Supabase,
   no hay credenciales hardcodeadas en el código, no hay archivos `fix/backup/old/temp`, no hay
   try/catch que fabriquen datos falsos. El patrón "memoria vs. BD real" (`USING_REAL_DB`,
   `demo-store.ts`) es un modo demo **intencional y documentado**, no un fallback para esquivar
   Supabase — ver la sección de discrepancias más abajo, porque esto contradice parcialmente el
   relato de "sesión en bucle generando parches".
2. **La causa real del fallo de Supabase está autodocumentada en el propio proyecto**: el host
   directo de Supabase (`db.<ref>.supabase.co:5432`) es IPv6-only, y esta Mac se quedó sin salida
   IPv6 real a mitad de tarea → `ENOTFOUND`/`no route to host`. No es RLS, no son credenciales
   inválidas, no es un bug de cliente. Ya está mitigado en el propio `.env.example` de v2 (usa el
   Connection Pooler, IPv4). Detalle en la sección 5.
3. **Hay un secreto que SÍ hay que rotar**: la contraseña de la BD de Supabase del proyecto
   antiguo quedó escrita en el historial de chat de una sesión anterior (nota propia del proyecto
   en `PROGRESS.md` §6 y `BACKLOG.md`, sección "🔴 Urgente — seguridad", nunca resuelta). No es del
   proyecto nuevo (`v2` usa un Supabase distinto) pero sigue abierta. Ver sección 6.
4. El código vale la pena migrarse por capas: **`packages/engine` y buena parte de
   `packages/integrations` son fuertes candidatos a MIGRAR casi tal cual** (puros, probados,
   documentados). **`packages/db` (esquema + repos) y la UI de `apps/web` son las áreas más
   señaladas para REESCRIBIR** — el esquema porque la propia skill de v2 pide repensarlo, la UI
   porque el propio dueño del proyecto la calificó de "horrible" en `PROGRESS.md`.

---

## 1. Tabla de clasificación (archivo/módulo → categoría → motivo)

Leyenda: **MIGRAR** = se copia y adapta (imports, nombres de paquete) sin rehacer la lógica.
**REESCRIBIR** = la decisión/lógica de fondo es válida pero la implementación se reescribe limpia
contra el nuevo esquema/skill, sin copiar-pegar y parchar después. **DESCARTAR** = no se lleva.

### 1.1 Frontend — `apps/web/`

| Archivo / módulo | Categoría | Motivo |
|---|---|---|
| `app/page.tsx` (landing) | REESCRIBIR | Funcional pero trivial; rehacer con la skill de diseño en vez de copiar estilos inline. |
| `app/dashboard/page.tsx` | REESCRIBIR | Corre el motor real pero sobre datos **sintéticos**; nunca se conectó a `loadTradeSet()`. Rehacer contra datos reales desde el principio. |
| `app/trades/page.tsx`, `app/trades/new/page.tsx`, `app/trades/[book]/[id]/page.tsx`, `app/trades/compare/page.tsx`, `loading.tsx` (x2) | REESCRIBIR | Funcionales end-to-end contra el almacén en memoria, pero atados 1:1 al esquema/contratos que se van a rediseñar. La lógica de flujo (Server Component lee de `lib/data.ts`, nunca de `@tradevision/db`) es el patrón a conservar, no el archivo. |
| `app/api/uploads/route.ts`, `app/api/uploads/[key]/route.ts` | REESCRIBIR | Lógica sólida (firma, valida mime/tamaño, 403 por propiedad de la key) — **portar el diseño**, reescribir contra el storage y userId nuevos. |
| `app/trades/actions.ts` (Server Actions) | REESCRIBIR | Superficie de acciones bien pensada (ver `docs/API_CONTRACT.md` §2); reescribir contra los repos nuevos. Ojo al bug conocido: `saveJournalNoteAction` recibía `props` desde un snapshot renderizado en servidor y podía pisar cambios paralelos del panel — no repetir ese diseño. |
| `app/[handle]/page.tsx` (Perfil Público) | DESCARTAR | Solo resuelve `/@valeria` hardcodeado; `generateStaticParams` devuelve `[]`. Es un skeleton sin lógica real — más rápido reescribir desde cero que adaptar. Nota de arquitectura a conservar: la ruta debe llamarse `app/[handle]`, no `app/@[handle]` (colisiona con *parallel routes* de Next.js). |
| `lib/data.ts` (fachada) | REESCRIBIR | **El patrón es la pieza más valiosa de todo el frontend**: una única costura (`lib/data.ts`) que las páginas consumen, con un switch documentado memoria/BD real. Consérvalo conceptualmente; el contenido se reescribe porque cada función delega en repos que cambian de forma. |
| `lib/demo-store.ts`, `lib/demo-data.ts` | REESCRIBIR (pendiente de decisión) | Modo demo en memoria intencional, no basura. Si v2 quiere seguir permitiendo ver la UI sin infraestructura, se reescribe contra los tipos nuevos; si no, se descarta. Ver discrepancia §3. |
| `lib/journal.ts`, `lib/trade-view.ts` | MIGRAR (con ajuste de tipos) | Helpers puros de presentación sobre `@tradevision/engine`/`@tradevision/contracts`. Pequeños, sin I/O, fáciles de adaptar a los tipos nuevos. |
| `lib/auth.ts` | DESCARTAR | Stub de una línea (`getCurrentUser = currentUser`) con un TODO explícito de Clerk. No hay nada que migrar; se construye junto con la decisión de auth (§3). |
| `components/StatBadge.tsx`, `components/MetricCard.tsx` | REESCRIBIR | Lógica de mapeo (estado → color/ícono/texto vía `STATE_DESCRIPTORS`) correcta y alineada con FR-13; la implementación visual se rehace con la skill de diseño. |
| `components/journal/*.tsx` (AccountBar, CompareResult, EquityCurve, MonthCalendar, SummaryStrip, TradeCardGrid, TradeLogTable, TradeRegistryView) | REESCRIBIR | Funcionales pero con estilos inline y `<select>`/`<input>` nativos en vez de sistema de diseño. `PropertiesPanel` es, textualmente, "lo que el usuario llama horrible" según `PROGRESS.md` §3.2 — no es una opinión mía, es una cita del propio proyecto. |
| `components/trade/*.tsx` (AnnotationWorkspace, EditorsClient, NarrativeEditor, NewManualTradeForm, PropertiesPanel, PublicAnnotationEditor, TradeAttachments, TradeJournalEditor) | REESCRIBIR | Mismo motivo. El patrón `next/dynamic({ssr:false})` para envolver BlockNote (toca `window`) sí vale la pena conservar como técnica. |
| `components/SiteNav.tsx` | REESCRIBIR | Trivial, sin lógica de negocio. |
| `components/dashboard/RadarChart.tsx` | REESCRIBIR | El Tech Spec pide un radar real; el proyecto antiguo lo pintaba como tarjetas (sin librería de gráficos instalada). Rehacer con una librería de charts elegida a propósito. |
| `app/globals.css` + `.tv-*` classes | DESCARTAR | ~250 líneas de utilidades ad-hoc sin Tailwind/CSS Modules. Reemplazar por lo que decida la skill de diseño para v2. |
| `next.config.mjs`, `tsconfig.json`, `package.json` (apps/web) | MIGRAR | Ya replicado en v2 casi 1:1 (verificado: `transpilePackages`, `serverExternalPackages`, versiones fijadas de React/Next/Mantine coinciden). Sin acción — es confirmación, no trabajo pendiente. |
| `.eslintrc.json` (apps/web) | MIGRAR | **Corrección (Bloque 1):** esta fila decía "ya replicado" en la versión original de este plan — era incorrecto, el archivo no existía en el scaffold de v2 (`next lint` caía en un prompt interactivo de setup). Copiado del proyecto antiguo (`{"extends": "next/core-web-vitals"}`, una línea, sin lógica) al cerrar el Bloque 1 porque bloqueaba el lint en verde. |

### 1.2 Backend de datos — `packages/db/`

| Archivo / módulo | Categoría | Motivo |
|---|---|---|
| `src/schema.ts` (18 tablas) | REESCRIBIR | La propia skill de v2 y el propio `schema.ts` placeholder de v2 ya lo dicen: repensar, no copiar. **Pero las invariantes forzadas en BD son oro y hay que preservarlas como reglas, no como SQL literal**: trigger append-only en operaciones verificadas, `CHECK manual_never_verified`, `CHECK annotation_exactly_one_book`, `CHECK snapshot_seal_only_verified`, UNIQUE de idempotencia de sync, RLS activado en todo `public` sin grants a `anon`/`authenticated`. |
| `src/repositories/*.ts` (trades, catalogs, stats, accounts, users) | REESCRIBIR | Buen diseño de API (ver `docs/API_CONTRACT.md`), pero atado 1:1 al esquema que se rediseña. Repasar la superficie de funciones como checklist de "qué debe seguir existiendo", no como código a pegar. |
| `src/client.ts` (`getDb()` lazy) | REESCRIBIR | El patrón de conexión perezosa singleton (real Postgres vs. modo dev) es bueno y digno de conservar. **La rama PGlite es código muerto real**: el propio `PROGRESS.md` §4.6 dice que se intentó, se descartó por un bug del bundler de Next-dev con `.wasm`, y quedó **inalcanzable desde la web** (`lib/data.ts` nunca la activa). Decisión pendiente, no tomada aquí: ¿v2 quiere modo dev sin infraestructura (PGlite u otra cosa) o no? |
| `src/dev-bootstrap-sql.ts` | DESCARTAR | Solo existe para alimentar la rama PGlite descartada; autogenerado desde una migración del esquema viejo. |
| `src/setup.ts`, `src/seed.ts`, `src/seed-dev.ts` | REESCRIBIR | Buena idea de UX (`pnpm db:setup` idempotente: migra + trigger + RLS + seeds en un comando) — conservar el flujo, reescribir el contenido contra el esquema nuevo. |
| `src/sql/append_only.sql`, `src/sql/rls.sql` | REESCRIBIR | El **enfoque** (trigger append-only aparte de las migraciones de Drizzle; script de RLS dinámico que recorre `public` en vez de listar tablas a mano) es la parte valiosa. El SQL en sí referencia tablas del esquema viejo. |
| `drizzle/*.sql`, `drizzle/meta/*.json` | DESCARTAR | Migraciones generadas del esquema viejo; se regeneran limpias desde el `schema.ts` nuevo. |
| `drizzle.config.ts`, `package.json` (scripts db:generate/migrate/studio) | MIGRAR | Ya replicado en v2; confirmación, no trabajo pendiente. |

### 1.3 Motor de analítica — `packages/engine/` — el área más limpia del proyecto

| Archivo / módulo | Categoría | Motivo |
|---|---|---|
| `src/compute.ts`, `src/metrics.ts`, `src/filter.ts`, `src/plan-vs-executed.ts`, `src/radar.ts`, `src/version.ts` | **MIGRAR** | Funciones puras (sin I/O, sin `Date.now()`, sin aleatoriedad), versionadas (`ENGINE_VERSION`), con tests de regresión que fallan si la fórmula cambia sin subir versión. Es exactamente el tipo de código que sobrevive un reinicio de infraestructura. |
| `test/regression.test.ts`, `test/metrics.test.ts`, `test/fixtures.ts`, `test/__snapshots__/*` | MIGRAR | Cobertura de regresión real (25 tests); protege contra cambios silenciosos de fórmula. |
| — | — | **Nota de producto, no de código**: los pesos del Radar Score (`DEFAULT_RADAR_WEIGHTS`) están marcados como "punto de partida sin calibrar" en el propio proyecto. Migrar el motor no significa que las fórmulas estén validadas con datos reales — sigue pendiente. |

### 1.4 Integraciones — `packages/integrations/`

| Archivo / módulo | Categoría | Motivo |
|---|---|---|
| `src/round-trips.ts` + `test/round-trips.test.ts` | **MIGRAR** | Puro, sin I/O, 9 tests. Reemplaza un emparejador naive que descartaba en silencio scale-in/scale-out/flip — es la pieza que el propio proyecto identificó como "el gap de mayor impacto". Adaptado (no copiado) de LuxAlgo Trade Journal (MIT) — mantener la atribución si se conserva. |
| `src/csv-import.ts` + `test/csv-import.test.ts` | MIGRAR | Parser tolerante (alias de cabecera, fechas naive→UTC), 4 tests, sin acoplar a BD. |
| `src/storage.ts` | **MIGRAR** | El ejemplo a seguir de "cómo se hace bien": un único punto de creación del cliente (`supabaseAdmin()`), selección de proveedor por entorno (Supabase → R2 → 503 explícito), reintento único y justificado (bucket no existe → crear → reintentar una vez), errores siempre propagados, nunca silenciados. |
| `src/r2.ts` + `test/r2.test.ts` | MIGRAR | Helpers de firma R2 usados como fallback de `storage.ts`; probados. |
| `src/metaapi.ts` + `test/metaapi.test.ts` | REESCRIBIR | `normalizeClosedPositions` ya usa `buildRoundTrips` correctamente (MIGRAR esa parte conceptualmente), pero `createMetaApiClient()` es un stub que siempre lanza — no hay cliente real que migrar. Construir el cliente HTTP de cero cuando haya credenciales de MetaApi/cTrader. |
| `src/mentor-ia.ts` | REESCRIBIR (ver §1.5) | `toMentorResponse()` (normalizador puro) vale la pena conservar; `createMentorClient().analyze()` es un stub que siempre lanza — sin lógica real que migrar. |

### 1.5 IA Mentor — hoy repartida entre `packages/contracts` y `packages/integrations`

| Archivo / módulo | Categoría | Motivo |
|---|---|---|
| `packages/contracts/src/mentor.ts` (`MentorAnalysisType` lista cerrada, `MentorAnalysisCategory`, `MentorObservation`, `MentorAnalysisResponse`, `MENTOR_ANALYSIS_CATEGORY`) | **MIGRAR** | Decisión de producto real y bien acotada: lista cerrada de tipos de análisis para que el modelo no invente categorías. Vale la pena conservar el contrato tal cual. |
| `packages/integrations/src/mentor-ia.ts` — `toMentorResponse()` | MIGRAR | Función pura de normalización, sin acoplar al resto del stub. |
| `packages/integrations/src/mentor-ia.ts` — `createMentorClient()` | DESCARTAR (construir nuevo) | Nunca se implementó la llamada real a la API de Claude; solo hay un `throw new Error("TODO: …")`. No hay lógica que reescribir, hay que construirla. |
| — | — | **Decisión de estructura pendiente** (no la tomo aquí, ver §3): ¿Mentor IA vive dentro de `packages/integrations` como en el proyecto antiguo, o se le da un paquete propio (`packages/mentor`) para que el límite "nunca toca `verified_trades`, nunca expone datos privados" sea una frontera de paquete y no solo un comentario? Lo propongo como opción en la estructura de carpetas (§7) pero es una decisión del dueño del producto. |

### 1.6 Pruebas — resumen transversal

| Área | Cobertura en el proyecto antiguo | Categoría |
|---|---|---|
| `packages/engine` | 25 tests (regresión + métricas), verde | MIGRAR |
| `packages/integrations` | 11 tests (csv-import, metaapi, r2, round-trips), verde | MIGRAR (junto con su código) |
| `packages/db` (repos) | **0 tests** — probados manualmente contra Postgres real una vez, no hay suite | — (construir de cero contra el esquema nuevo) |
| `apps/web` (páginas, fachada, Server Actions) | **0 tests**, sin E2E | — (construir de cero) |
| CI (`.github/workflows/ci.yml`) | Corre `typecheck + test + build` | MIGRAR (confirmar que v2 ya lo tiene o portarlo) |

### 1.7 Config raíz y tooling

| Archivo | Categoría | Motivo |
|---|---|---|
| `turbo.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `.npmrc`, `.prettierrc.json`, `package.json` (raíz, incluye `pnpm.overrides` de Mantine) | MIGRAR | **Ya están replicados en v2 y verificados idénticos** en esta auditoría (mismo `strict`+`noUncheckedIndexedAccess`+`verbatimModuleSyntax`, mismo override de Mantine `^8.3.4`, mismo `engines.node >=22`). Sin acción. |
| `docs/import-template.csv` | MIGRAR | Plantilla de referencia para el importador CSV (aún sin endpoint ni UI en ningún proyecto). |
| `docs/references/luxalgo-trade-journal/` | MIGRAR (como referencia, no como código de producto) | Repo MIT usado como referencia de diseño para el motor de round-trips. Mantener solo si se sigue consultando; no es código propio. |
| `.claude/agents/*.md` (backend-tradevision, db-supabase-tradevision, frontend-tradevision, tv-code-reviewer, tv-orchestrator) | Opcional — no evaluado a fondo | Configuración de subagentes locales (ni siquiera están en git del proyecto antiguo: `.gitignore` excluye `.claude/`). Si el flujo de "un subagente mantiene BACKLOG.md" fue útil, es una decisión de proceso a replicar en v2, no de código. Fuera del alcance de esta auditoría de código. |

---

## 2. Cosas que NO encontré (y que el relato de "bucle" hacía esperar)

Para que quede explícito, porque cambia el diagnóstico de la sección 5:

- ❌ Más de un cliente de Supabase — solo hay un punto de creación en `packages/db/src/client.ts`
  (Postgres) y uno en `packages/integrations/src/storage.ts` (Storage), cada uno con una única
  función factory.
- ❌ Credenciales hardcodeadas en código fuente — ninguna. Las claves reales solo viven en
  `.env`/`.env.local`, ambos en `.gitignore` y nunca trackeados (confirmado con
  `git log --all --diff-filter=A --name-only | grep env` y una búsqueda de patrones de secreto
  sobre el historial completo — ver sección 6).
- ❌ try/catch que silencien errores para simular éxito — el único `catch` que no relanza
  (`client.ts`, aplicar el trigger append-only en modo PGlite) hace `console.warn` y **continúa en
  un modo dev inalcanzable desde la web**; no enmascara un fallo de producción.
- ❌ Fallbacks a datos mock/localStorage para esquivar un servicio caído — el modo memoria
  (`demo-store.ts`) es un modo explícito activado por la ausencia de `DATABASE_URL`, documentado
  como tal en tres archivos distintos (`CLAUDE.md`, `PROGRESS.md`, comentarios del propio
  archivo), no una salida de emergencia silenciosa.
- ❌ Archivos `fix/test2/backup/old/temp/_v2/_new` — no hay ninguno en `apps/`/`packages/` (los
  únicos `.old` que aparecen son caché de webpack en `.next/`, que ni siquiera se migra).
- ❌ Dependencias instaladas sin uso evidentes a simple vista en los `package.json` revisados
  (`db`, `integrations`, `web`, raíz) — cada dependencia tiene un import correspondiente
  verificado (postgres, pglite, drizzle-orm en `db`; papaparse, aws-sdk, supabase-js, nanoid en
  `integrations`). No se auditaron `contracts`/`engine`/`design-system` con la misma profundidad
  por ser paquetes casi sin dependencias.

**Conclusión de esta sección**: si hubo una sesión en bucle escribiendo basura, esa basura no
sobrevivió en el código que llegó a commitearse — o el historial de commits ya refleja una
limpieza posterior, o el daño real fue contra **filas** de la base de datos de Supabase (no contra
archivos), lo cual no puedo auditar desde aquí sin tocar ese proyecto (y no debo, es de solo
lectura). Si te consta que hubo más código roto que esto, dime dónde mirar y lo reviso puntual.

---

## 3. Discrepancias entre la skill y el código real (sin resolver — decisión tuya)

1. ~~**Auth (Clerk) y tRPC**~~ — **RESUELTO (2026-09-15, decisión de Leonardo): seguimos sin
   ambos por ahora.** `getCurrentUser()` continúa como stub de un solo usuario dev (igual que el
   proyecto antiguo); Bloque 8 se construye con Server Actions + `lib/data.ts`, sin tRPC. Cuando
   haya usuarios reales se evalúa auth (Clerk o, dado que ya usamos Supabase, Supabase Auth como
   alternativa natural — comparación pendiente para ese momento). tRPC solo se reconsidera si
   aparece un cliente externo (móvil, integración de terceros) que necesite una API HTTP formal.
2. ~~**`apps/parser-py`**~~ — **RESUELTO (2026-09-15): fuera de alcance por ahora.** No se crea la
   carpeta; no se agenda ningún bloque de migración para ella (ver §8).
3. ~~**Límite del paquete de Mentor IA**~~ — **RESUELTO (2026-09-15): paquete propio,
   `packages/mentor`.** Solo puede importar `contracts` + una interfaz de solo-lectura angosta
   expuesta por `db` — nunca el cliente Drizzle completo ni el resto de `integrations`. Así FR-38
   ("el Mentor nunca toca Estadística Verificada ni se publica") queda forzado por typecheck
   (límite de import entre paquetes), no solo documentado como regla. Se crea junto con el Bloque
   7 (§8), ya con esta forma desde el principio.
4. ~~**Modo demo en memoria**~~ — **RESUELTO (2026-09-15): se conserva.** Leonardo quiere seguir
   probando la app sin depender de Supabase estar arriba. `demo-store.ts`/`demo-data.ts` se
   reescriben (no se copian tal cual) contra los tipos nuevos de `contracts`, manteniendo el mismo
   patrón: `USING_REAL_DB` como único conmutador, activado por la presencia de `DATABASE_URL`.

Las 4 discrepancias de la Fase 1 quedaron resueltas. El plan de §7/§8 más abajo ya refleja estas
decisiones.

---

## 4. Otros gaps heredados que siguen abiertos (no son discrepancias con la skill, son deuda ya conocida del proyecto antiguo)

Por si quieres priorizarlos en el roadmap de v2 (no bloquean el plan de migración):

- Sharpe ratio y Z-score del motor siempre devuelven `insufficient_data` — falta validar la
  metodología (supuesto abierto del propio PRD).
- `stat_snapshots` nunca se materializaba automáticamente — no hay job (el Tech Spec menciona
  Inngest, nunca se instaló).
- Sin observabilidad (PostHog/Sentry), sin email transaccional (Resend), sin i18n (español
  hardcodeado pese a que el PRD pide ES-first + EN fast-follow).
- `TradeExecution.side` usa `"long"|"short"` en vez de `"buy"|"sell"` — el propio `CLAUDE.md` del
  proyecto antiguo lo marca como "semánticamente impreciso" pero nunca lo corrigieron por no
  romper un contrato ya consumido por el frontend. En v2, como se reescribe desde cero, es un buen
  momento para decidir si se corrige.

---

## 5. Diagnóstico de Supabase — causa raíz del fallo de conexión (hipótesis, sin arreglos)

**Evidencia usada**: notas explícitas y fechadas en `CLAUDE.md` §4/§8, `PROGRESS.md` §4.17-18 y
§6, y `BACKLOG.md` del proyecto antiguo — no inferencia mía sobre código, son admisiones directas
del propio proyecto sobre lo que pasó.

**Hipótesis principal (alta confianza): red/entorno, no código.**
El proyecto Supabase antiguo (`ppasceqbpmazadqmnhhq`) solo expone conexión **directa** por
`db.<ref>.supabase.co:5432`, y esa ruta es **IPv6-only** en proyectos nuevos de Supabase. La Mac
usada se quedó sin salida IPv6 real a mitad de tarea (dos sesiones seguidas fallando con
`ENOTFOUND`/`no route to host` — errores de resolución/ruta, no de autenticación ni de permisos).
Eso descarta:
- **Variables de entorno mal puestas**: el propio código las carga correctamente (`client.ts`
  lee `DATABASE_URL`, decide TLS por si el host es localhost); el error ocurre a nivel de
  transporte TCP, antes de que Postgres llegue a evaluar credenciales.
- **RLS**: RLS solo filtra filas *después* de establecer sesión, y la app conecta con el rol
  `postgres` (dueño de las tablas), que **bypassa RLS** por diseño mientras no haya `FORCE ROW
  LEVEL SECURITY` (confirmado, no se usa `FORCE`). Un fallo de RLS se vería como "0 filas" o
  "permission denied for table X" en runtime, nunca como `ENOTFOUND`/`no route to host` al
  conectar.
- **Configuración del cliente**: `postgres-js` con `ssl:"require"` es la config estándar para
  Supabase; no hay señales de mal uso (prepared statements desactivados a propósito, correcto
  para el pooler).

**Factor agravante que explica el patrón de "reintentos" (el segundo error, distinto del primero):**
Migrar (`drizzle-kit`/`db:setup`) necesita la conexión **directa** (5432) por los advisory locks de
las migraciones; el **Session Pooler** (IPv4, el workaround que sí resuelve) sirve para runtime
pero rompe esos locks. Es decir: hay dos rutas de conexión con requisitos distintos, y solo una
(el pooler) quedó disponible — así que dos migraciones (`0003`, `0004`) se quedaron generadas pero
nunca aplicadas. Si una sesión intentó repetidamente `pnpm db:setup` sin saber esto, cada intento
falla igual y se ve como un bucle, aunque la causa de fondo sea siempre la misma (falta de ruta
IPv6) y no un error de código que cambia entre intentos.

**Para v2**: el mismo riesgo existe si la Mac sigue sin IPv6 real, pero está mitigado por diseño —
`packages/db/.env` y `.env.example` de v2 **ya usan el Session Pooler por defecto** (IPv4),
apuntando además a un proyecto Supabase distinto (`htezajywbjautjioxvzw`). No verifiqué
conectividad real en esta fase (instrucción explícita: solo diagnóstico) — el Bloque 0 de la Fase
2 es exactamente esa prueba aislada.

---

## 6. Secretos expuestos

- **Git**: revisé el historial completo (`git log --all -p` sobre archivos `.env*`, más una
  búsqueda de patrones `sb_secret_`, `sb_publishable_`, `SUPABASE_SERVICE_ROLE_KEY=`,
  `DATABASE_URL=postgres://` en todo el árbol de commits). Las únicas coincidencias son nombres de
  variable en `.env.example` (valores vacíos, tal como deben estar) y menciones en prosa dentro de
  `PROGRESS.md`. **No hay ninguna clave real committeada.**
- **Working tree**: `packages/db/.env` y `apps/web/.env.local` (reales, con `DATABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY`) existen en disco pero están correctamente en `.gitignore` y nunca
  trackeados.
- **⚠️ Pendiente real — confirmado por notas propias del proyecto, no descubierto por mí**: la
  contraseña de la base de datos de Supabase (proyecto antiguo) **quedó escrita en el historial de
  chat de una sesión anterior** — así lo dice `PROGRESS.md` §6 punto 2 y lo repite `BACKLOG.md`
  bajo "🔴 Urgente — seguridad", sin marcar como resuelto en ningún commit posterior. Recomendación
  (no ejecutada por mí, fuera de alcance de Fase 1): rotar esa contraseña en el dashboard de
  Supabase del proyecto **antiguo** cuanto antes, independientemente de que v2 no la reutilice —
  sigue siendo una credencial viva de una base de datos real.
- `.mcp.json` (raíz, `tradevision/`, `tradevision-v2/`) solo contiene `project_ref` en la URL del
  conector MCP de Supabase (OAuth), sin claves embebidas — revisado, limpio.

---

## 7. Estructura de carpetas propuesta para `tradevision-v2`

La skill de v2 ya fija el andamiaje (pnpm workspaces + Turborepo, mismo layout de paquetes que el
proyecto antiguo) — no propongo reinventarlo, propongo **trazar los límites de área** dentro de lo
que ya existe, más una opción explícita para Mentor IA (discrepancia §3.3):

```
apps/
  web/                      FRONTEND. Next.js App Router. Server Components leen SOLO de
                             lib/data.ts; Server Actions en app/**/actions.ts; nunca
                             `import … from "@tradevision/db"` dentro de app/**. Conserva el modo
                             demo en memoria (USING_REAL_DB como único conmutador).
                             (Sin apps/parser-py — fuera de alcance por ahora.)

packages/
  contracts/                CAPA COMPARTIDA (ni frontend ni backend en exclusiva). Tipos +
                             esquemas Zod. Fuente de verdad de forma de datos; sin lógica salvo
                             validación.
  design-system/            FRONTEND. Tokens CSS + descriptores de estado. Sin lógica de datos.
  engine/                   BACKEND. Funciones puras de analítica, sin I/O. Versionado por
                             ENGINE_VERSION.
  db/                       BACKEND. Esquema Drizzle + migraciones + repositorios + trigger/RLS
                             SQL. Único paquete con acceso directo a Postgres.
  integrations/             BACKEND. CSV, sync de bróker, motor de round-trips, storage de
                             adjuntos. Sin acceso directo a Postgres — recibe datos, no los busca.
                             NO incluye Mentor IA (ver mentor/ abajo).
  mentor/                   IA MENTOR — paquete propio (decidido 2026-09-15). Solo importa
                             `contracts` + una interfaz de solo-lectura angosta expuesta por `db`
                             (nunca el cliente Drizzle completo, nunca el resto de
                             `integrations`). Así FR-38 ("el Mentor nunca toca Estadística
                             Verificada ni se publica") queda forzado por typecheck, no solo
                             documentado. Se construye en el Bloque 7 (§8), esta semana.
  billing/                  Vacío a propósito (post-MVP), igual que el proyecto antiguo.

docs/
  API_CONTRACT.md           Este borrador — se actualiza bloque a bloque en Fase 2.
  STATUS.md                 Se crea al cierre (ver instrucción de CIERRE del encargo).
```

**Límites de cada área (regla de import, para que quede verificable):**

- **Frontend** (`apps/web`) → puede importar `contracts`, `design-system`, `engine` (tipos),
  `integrations` (tipos). **Nunca** `db` directo — solo a través de `lib/data.ts`.
- **Backend** (`db`, `engine`, `integrations`) → puede importar `contracts`. `engine` no importa
  nada más (debe seguir puro). `integrations` no importa `db` (recibe datos ya cargados,
  como hoy con `buildRoundTrips(fills)`).
- **IA Mentor** (`mentor/`, si se separa) → importa `contracts` y, como mucho, una interfaz de
  lectura angosta expuesta por `db` (no el cliente Drizzle completo). No lo importa `apps/web`
  directo — pasa por una Server Action dedicada, igual que cualquier otra escritura.

---

## 8. Orden de migración por bloques

Bloque 0 es obligatorio y bloqueante por instrucción explícita tuya; el resto sigue, a grandes
rasgos, el orden de construcción del Tech Spec §16 (de lo que no depende de nada hacia lo que
depende de todo).

| # | Bloque | Categoría dominante | Depende de | Notas |
|---|---|---|---|---|
| 0 | Script mínimo y aislado de conexión a Supabase (proyecto nuevo, pooler) | — | nada | **Nada que dependa de Supabase se migra hasta que esto pase.** Ver diagnóstico §5. |
| 1 | `packages/contracts` | MIGRAR | Bloque 0 no requerido (sin I/O) | Base de tipos para todo lo demás. |
| 2 | `packages/design-system` | MIGRAR | — | Tokens, independiente del resto. |
| 3 | `packages/engine` + sus tests | MIGRAR | contracts | Puro; puede migrarse casi textual. |
| 4 | `packages/db` — `schema.ts` (invariantes) + migración inicial | REESCRIBIR | Bloque 0 (para aplicar) | No aplicar migraciones hasta que 0 esté verde. |
| 5 | `packages/db` — `client.ts` + repositorios | REESCRIBIR | 4 | Decidir aquí la rama PGlite (discrepancia de facto, §1.2). |
| 6 | `packages/integrations` — `round-trips.ts`, `csv-import.ts`, `storage.ts`, `r2.ts` | MIGRAR | contracts | Sin acoplar a `db`. |
| 6b | `packages/integrations` — `metaapi.ts` (cliente real) | REESCRIBIR | 6 | Solo si hay credenciales MetaApi/cTrader disponibles; si no, queda como stub explícito igual que antes. |
| 7 | `packages/mentor` (paquete propio, decidido §3.3) | MIGRAR contrato (`contracts/src/mentor.ts`, `toMentorResponse`) / REESCRIBIR cliente | contracts | Requiere `ANTHROPIC_API_KEY`; cliente Claude se construye de cero. Esta semana, según lo dicho. |
| 8 | `apps/web/lib/data.ts` (fachada) + Server Actions + Route Handlers | REESCRIBIR | 4, 5, 6 | Sin Clerk/tRPC (decidido §3.1): `currentUser()` sigue como stub de un solo usuario dev. Incluye reescribir `demo-store.ts`/`demo-data.ts` (se conservan, decidido §3.4) contra los tipos nuevos. |
| 9 | `apps/web` UI (páginas + componentes) | REESCRIBIR | 8 | Con la skill de diseño desde el principio, no como retoque posterior. |

`apps/parser-py` queda fuera de este plan — no se agenda ningún bloque para él (decidido §3.2).

Cada bloque, al cerrarse (regla tuya, la repito porque es la que manda): build + lint + typecheck
en verde, `git status` limpio de `.env`/credenciales, commit descriptivo, push a `origin main`,
resumen corto, y espera tu OK antes de abrir el siguiente.

---

## 9. Estado del plan

Las 4 discrepancias de la Fase 1 están resueltas (§3). Sigue pendiente, fuera del código:

1. Rotar la contraseña de Supabase del proyecto **antiguo** (§6) — no bloquea v2 técnicamente,
   pero es una credencial viva expuesta. Queda en tu cancha.
2. Tu luz verde explícita para arrancar el **Bloque 0** (§8): el script aislado de verificación de
   conexión a Supabase contra el proyecto nuevo. Nada que dependa de Supabase se toca antes de que
   ese script pase.

No se ha tocado ningún archivo de `apps/`, `packages/` de `tradevision-v2`, ni nada de
`tradevision/`.
