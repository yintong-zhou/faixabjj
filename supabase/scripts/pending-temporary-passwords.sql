-- Lists the accounts still waiting for their first password change. Run BY HAND
-- in the SQL Editor of project poksgledkecwviypspmi. Read-only.
--
-- Until 2026-09-25 every account the portal created or reset started on one
-- shared password, printed in the UI and in the repository's history. Any
-- account listed here may still be on it, and anybody who ever saw it can sign
-- in as that account and choose its password. Give each one a fresh temporary
-- password — "Reset password" in the account's row menu on /members, or on
-- /gyms/<id> for a gym manager — and pass the new one on; the old one then
-- stops working. Once this returns no rows, nobody is exposed.
select
  u.email,
  g.name as gym,
  coalesce(
    (
      select string_agg(r.role::text, ', ' order by r.role::text)
      from public.assigned_role r
      where r.person_id = p.id and r.end_date is null
    ),
    'student'
  ) as roles,
  u.created_at,
  u.last_sign_in_at
from auth.users u
left join public.person p on p.auth_user_id = u.id
left join public.gym g on g.id = p.gym_id
where (u.raw_app_meta_data ->> 'must_change_password')::boolean is true
order by g.name nulls first, u.email;
