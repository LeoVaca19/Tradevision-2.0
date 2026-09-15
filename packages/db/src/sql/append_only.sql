-- Invariante de append-only para el Libro Verificado (Tech Spec §1.1, §5.1).
-- Ejecutar DESPUÉS de `pnpm db:migrate`. Idempotente.
--
-- Bloquea UPDATE y DELETE sobre verified_trades a nivel de motor de BD. La única
-- forma de "corregir" una operación verificada es un evento compensatorio
-- (una fila nueva), nunca mutar la existente.

create or replace function tv_block_mutation() returns trigger as $$
begin
  raise exception '% es append-only: % no está permitido', tg_table_name, tg_op
    using hint = 'Inserta un evento compensatorio en lugar de mutar la fila.';
end;
$$ language plpgsql
set search_path = '';
-- `search_path` fijo (vacío): recomendación de seguridad de Supabase para
-- toda función de Postgres (linter `function_search_path_mutable`) — evita
-- que alguien con permiso de crear objetos en algún schema del search_path
-- pueda "secuestrar" una referencia sin schema dentro de la función. Esta
-- función no referencia tablas/objetos por nombre corto (sólo variables
-- internas de trigger: tg_table_name, tg_op), así que no cambia su
-- comportamiento.

drop trigger if exists tv_verified_trades_no_update on verified_trades;
create trigger tv_verified_trades_no_update
  before update on verified_trades
  for each row execute function tv_block_mutation();

drop trigger if exists tv_verified_trades_no_delete on verified_trades;
create trigger tv_verified_trades_no_delete
  before delete on verified_trades
  for each row execute function tv_block_mutation();

-- Mismo invariante para los fills crudos de bróker (`trade_executions`). Un
-- fill ya ingerido nunca se edita ni se borra; una corrección es una
-- re-ingesta con `broker_deal_id` nuevo o un evento compensatorio, igual que
-- en verified_trades.
drop trigger if exists tv_trade_executions_no_update on trade_executions;
create trigger tv_trade_executions_no_update
  before update on trade_executions
  for each row execute function tv_block_mutation();

drop trigger if exists tv_trade_executions_no_delete on trade_executions;
create trigger tv_trade_executions_no_delete
  before delete on trade_executions
  for each row execute function tv_block_mutation();
