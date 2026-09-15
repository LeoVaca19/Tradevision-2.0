# TradeVision v2

Scaffold nuevo, arrancado el 2026-09-12. `../tradevision/` (carpeta hermana) queda como
**referencia de diseño de solo lectura** — no se reusa su código porque un agente conectado
a esa Supabase entró en bucle generando código basura contra la BD real.

Mismo andamiaje de monorepo que el proyecto anterior (pnpm + Turborepo, mismos límites de
paquete), implementación 100% nueva.

## Requisitos

- Node.js 22 LTS
- pnpm 9 (`corepack enable`)
- Un proyecto Supabase **nuevo** (no el de `tradevision/`) — crear en
  [supabase.com/dashboard](https://supabase.com/dashboard). Usa el Connection Pooler
  (puerto 6543) en vez del host directo (IPv6-only) salvo que confirmes salida IPv6 real
  desde tu máquina.

## Arranque

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

`packages/db/.env.example` documenta las variables necesarias una vez tengas el proyecto
Supabase nuevo creado.

## Dónde está el contexto

- `.claude/skills/tradevision-project-context/SKILL.md` — qué es TradeVision, estado de
  este scaffold, stack, y dónde está el diseño de referencia.
- `../tradevision/CLAUDE.md` y `../tradevision/PROGRESS.md` — contrato y estado del
  proyecto anterior (referencia de diseño, no código a copiar).
- `../PRD 1.2 Tradevision` y `../Tech Spec 1.0 TradeVision.md` (raíz de `Proyecto 1`) —
  producto y arquitectura objetivo.
