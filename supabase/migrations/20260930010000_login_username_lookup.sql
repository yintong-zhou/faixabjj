-- FAIXABJJ — the login's username lookup, as one service-role-only call
--
-- Split out of 20260930000000, which was applied to the live project before
-- this function was added to it: the login's username path failed there with
-- PGRST202 (function not in the schema cache) and every username sign-in fell
-- through to the generic "wrong credentials". Replay-safe.

-- The login's lookup, in one call whatever the outcome. Resolving a username
-- with two requests (the person row, then the account) took measurably longer
-- when the username existed than when it did not, and that difference answered
-- "does Mario Rossi have an account here?" before any captcha is checked. One
-- statement makes the found and the not-found case the same round trip.
--
-- Executable by the service role only (emailForUsername in
-- frontend/utils/supabase/login-identifier.ts). Revoked from anon and
-- authenticated explicitly: default privileges on this schema grant execute on
-- every new function to both, and either could then map usernames to emails.
create or replace function public.login_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.person p
  join auth.users u on u.id = p.auth_user_id
  where p.username = p_username
  limit 1
$$;

revoke all on function public.login_email_for_username(text) from public, anon, authenticated;
grant execute on function public.login_email_for_username(text) to service_role;
