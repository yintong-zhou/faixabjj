-- FAIXABJJ — app_log: server errors and key events, for the platform superadmin
--
-- Errors used to reach console.error only (utils/log.ts), invisible outside
-- the deployment's logs. This table keeps them, with the key events (account,
-- promotion and gym actions), where the superadmin can read them on /logs.
--
-- Not a domain table: it belongs to the platform, no gym ever reads it, so it
-- has no gym_scope trigger and no "gym isolation" policy (the declared
-- exception in docs/claude/gyms.md). gym_id is informational and has no
-- foreign key, so a row outlives the gym it mentions.
--
-- No personal data: ids only. Postgres `details` is never stored — in a
-- unique violation it carries the row's values (an email, say).
--
-- Self-pruning: every insert deletes rows older than 7 days and everything
-- beyond the 2000 newest. Inside the write, so no pg_cron to enable and the
-- cap is never exceeded by more than a concurrent insert's own rows.
--
-- Only the service role writes (utils/log.ts); only a platform admin reads.
-- Apply BEFORE deploying the app. Replay-safe.

create table if not exists public.app_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null check (level in ('error', 'event')),
  scope text not null,
  action text not null,
  code text,
  message text,
  gym_id uuid,
  actor_id uuid,
  subject_id uuid
);

alter table public.app_log enable row level security;

revoke all on public.app_log from anon, authenticated;
grant select on public.app_log to authenticated;
grant select, insert on public.app_log to service_role;

drop policy if exists "platform admin reads the log" on public.app_log;
create policy "platform admin reads the log" on public.app_log
  for select to authenticated
  using (public.is_platform_admin());

-- Security definer: the deleting role is the table owner, whoever inserted.
-- `id <= null` (fewer than 2001 rows) deletes nothing.
create or replace function public.prune_app_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.app_log
  where created_at < now() - interval '7 days'
     or id <= (select id from public.app_log order by id desc offset 2000 limit 1);
  return null;
end;
$$;

revoke all on function public.prune_app_log() from public, anon, authenticated;

drop trigger if exists app_log_prune on public.app_log;
create trigger app_log_prune
  after insert on public.app_log
  for each statement execute function public.prune_app_log();
