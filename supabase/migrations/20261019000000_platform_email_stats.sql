-- Email statistics for the platform superadmin's /email page: how many emails
-- notify-flow accepted (sent) or refused (failed) in the last p_days days
-- (1–7, default 7 — app_log keeps no more), per recipient's gym and per
-- template.
--
-- Counts only, aggregated here (docs/claude/gyms.md): the superadmin never
-- reads a log row or a person row to work them out. Source: app_log rows of
-- scope `notify` written by deliver() (utils/notify-flow.ts) — level `event`
-- for an accepted send, `error` for a refused one; subject_id is the
-- recipient account. Test sends from /email are logged as `test:<template>`
-- and left out. A recipient with no person row (the superadmin, a deleted
-- account, a send with no account) counts under gym_id null.
--
-- Safe to run twice: create or replace, idempotent revoke/grant.

create or replace function public.platform_email_by_gym(p_days integer default 7)
returns table (gym_id uuid, sent bigint, failed bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.gym_id,
    count(*) filter (where l.level = 'event'),
    count(*) filter (where l.level = 'error')
  from public.app_log l
  left join public.person p on p.auth_user_id = l.subject_id
  where public.is_platform_admin()
    and l.scope = 'notify'
    and l.action not like 'test:%'
    and l.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 7)))
  group by p.gym_id
  order by count(*) desc;
$$;

create or replace function public.platform_email_by_template(p_days integer default 7)
returns table (template text, sent bigint, failed bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.action,
    count(*) filter (where l.level = 'event'),
    count(*) filter (where l.level = 'error')
  from public.app_log l
  where public.is_platform_admin()
    and l.scope = 'notify'
    and l.action not like 'test:%'
    and l.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 7)))
  group by l.action
  order by count(*) desc;
$$;

revoke all on function public.platform_email_by_gym(integer) from public, anon;
revoke all on function public.platform_email_by_template(integer) from public, anon;
grant execute on function public.platform_email_by_gym(integer) to authenticated;
grant execute on function public.platform_email_by_template(integer) to authenticated;
