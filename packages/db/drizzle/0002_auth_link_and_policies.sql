-- Supabase Auth ↔ public.users, y policies RLS por dueño.
--
-- 1) Trigger: cada alta en auth.users crea su fila en public.users
--    (auth_provider_id = auth.users.id::text). Atómico con el registro.
-- 2) current_app_user_id(): id de public.users del usuario autenticado.
-- 3) Policies "solo filas propias" para authenticated en las tablas con user_id.
--
-- NOTA: los grants a anon/authenticated siguen REVOCADOS (rls.sql) y la app
-- se conecta como `postgres` (bypass de RLS); el filtro efectivo hoy es el
-- `userId` de la sesión en los repositorios. Estas policies son defensa en
-- profundidad por si algún día se abre la Data API.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
begin
  base := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_-]', '-', 'g');
  if base = '' then base := 'trader'; end if;
  insert into public.users (auth_provider_id, handle, email)
  values (new.id::text, base || '-' || substr(replace(new.id::text, '-', ''), 1, 4), new.email)
  on conflict (auth_provider_id) do nothing;
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
--> statement-breakpoint
drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
--> statement-breakpoint
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.users where auth_provider_id = (select auth.uid())::text
$$;
--> statement-breakpoint
revoke all on function public.current_app_user_id() from public, anon;
--> statement-breakpoint
grant execute on function public.current_app_user_id() to authenticated;
--> statement-breakpoint
do $$
declare
  t text;
begin
  foreach t in array array[
    'trading_accounts','connected_accounts','setups','import_batches',
    'verified_trades','manual_trades','not_taken_trades','trade_annotations',
    'public_annotations','stat_snapshots','mentor_observations'
  ]
  loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated
         using (user_id = (select public.current_app_user_id()))
         with check (user_id = (select public.current_app_user_id()))', t);
  end loop;
end $$;
--> statement-breakpoint
drop policy if exists own_row on public.users;
--> statement-breakpoint
create policy own_row on public.users for select to authenticated
  using (auth_provider_id = (select auth.uid())::text);
