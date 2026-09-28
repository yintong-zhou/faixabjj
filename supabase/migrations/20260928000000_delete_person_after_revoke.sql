-- FAIXABJJ — deleting a person from the registry
--
-- Revoking access removes the auth account and keeps the person's registry row
-- and history. Deleting is the second, separate step, for somebody who has left
-- for good: it removes the row, and with it their attendance, roles and
-- promotion history (ON DELETE CASCADE); sessions they led and promotions they
-- signed keep existing with the name cleared (ON DELETE SET NULL).
--
-- The delete policy (20260911000000) already asked for a user manager, and the
-- restrictive "gym isolation" policy keeps it inside the caller's gym. What it
-- did not ask is that the account be gone first. Now it does: a row still
-- linked to an account cannot be deleted through the API, so the order
-- "revoke, then delete" holds for a crafted request too — and deleting never
-- leaves an auth account behind with no profile to belong to.
--
-- Cascades from `gym` (deleteGym) and from `auth.users` are foreign-key actions
-- and are not subject to this policy. Replay-safe.

drop policy if exists "user managers can delete person" on public.person;
create policy "user managers can delete person" on public.person
  for delete to authenticated
  using (public.can_manage_users() and auth_user_id is null);
