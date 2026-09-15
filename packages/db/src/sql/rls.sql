-- RLS + revocación de grants para bloquear la Data API (PostgREST) de Supabase.
--
-- Contexto: Supabase concede por defecto a `anon` y `authenticated` permisos
-- completos sobre toda tabla nueva de `public`, y la anon key es PÚBLICA (viaja
-- en el bundle del frontend). Sin RLS, eso es una BD abierta de par en par.
--
-- Esta app NO usa la Data API: se conecta como el rol `postgres` por conexión
-- directa/pooler. `postgres` es DUEÑO de estas tablas y el dueño hace BYPASS de
-- RLS mientras no se use FORCE. Por eso aquí sólo va ENABLE (nunca FORCE): la
-- app sigue viéndolo todo y la Data API queda en "0 filas, 0 escrituras" para
-- anon/authenticated.
--
-- Idempotente. Ejecutar DESPUÉS de las migraciones (lo hace `pnpm db:setup`).
-- Si se añaden tablas nuevas, volver a ejecutar este script.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> '__drizzle_migrations'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('revoke all on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

-- Que las tablas futuras de `public` tampoco hereden grants para anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
