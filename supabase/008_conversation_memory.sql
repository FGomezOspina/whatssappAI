-- Preserva body como texto original y vincula evidencia al mensaje de origen.
-- No elimina historial ni cambia los identificadores de las conversaciones.
begin;
alter table public.whatsapp_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists whatsapp_messages_memory_cursor_idx
  on public.whatsapp_messages (client_id, channel_user_id, created_at, id);
commit;
