-- Admin-gated access: the frontend only exposes /registro, /presenze and
-- /dashboard to a logged-in user (see frontend/proxy.ts and
-- frontend/utils/supabase/require-admin.ts) — there is no further per-role
-- split yet (e.g. an instructor seeing only their own students). Every
-- authenticated user is trusted staff for now, so policies are
-- intentionally permissive across the board rather than ownership-scoped.
-- Revisit if/when role-based restrictions are actually needed.

create policy "authenticated can select person" on person
  for select to authenticated using (true);
create policy "authenticated can insert person" on person
  for insert to authenticated with check (true);
create policy "authenticated can update person" on person
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete person" on person
  for delete to authenticated using (true);

create policy "authenticated can select assigned_role" on assigned_role
  for select to authenticated using (true);
create policy "authenticated can insert assigned_role" on assigned_role
  for insert to authenticated with check (true);
create policy "authenticated can update assigned_role" on assigned_role
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete assigned_role" on assigned_role
  for delete to authenticated using (true);

create policy "authenticated can select role_threshold" on role_threshold
  for select to authenticated using (true);
create policy "authenticated can insert role_threshold" on role_threshold
  for insert to authenticated with check (true);
create policy "authenticated can update role_threshold" on role_threshold
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete role_threshold" on role_threshold
  for delete to authenticated using (true);

create policy "authenticated can select attendance" on attendance
  for select to authenticated using (true);
create policy "authenticated can insert attendance" on attendance
  for insert to authenticated with check (true);
create policy "authenticated can update attendance" on attendance
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete attendance" on attendance
  for delete to authenticated using (true);

create policy "authenticated can select promotion_criteria" on promotion_criteria
  for select to authenticated using (true);
create policy "authenticated can insert promotion_criteria" on promotion_criteria
  for insert to authenticated with check (true);
create policy "authenticated can update promotion_criteria" on promotion_criteria
  for update to authenticated using (true) with check (true);
create policy "authenticated can delete promotion_criteria" on promotion_criteria
  for delete to authenticated using (true);
