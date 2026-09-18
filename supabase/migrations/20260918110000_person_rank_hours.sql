-- FAIXABJJ — attendance counted from the current grade, not from day one
--
-- The criteria measure the hours trained *inside* a transition (432 h during
-- the blue belt), not a lifetime total. Comparing a lifetime total would look
-- simpler and would get two ordinary cases wrong: somebody who arrives already
-- graded from another academy would start from zero here, and somebody who has
-- not trained for a year would stay just as close to the threshold as the day
-- they stopped, because a total never falls.
--
-- The columns count ATTENDANCE ROWS, not hours, and are named so. One
-- attendance is one hour in this app; the criteria are in clock hours; the
-- single place the two meet is SESSION_LENGTH_HOURS in frontend/utils/hours.ts.
--
-- The hours a member trained before the gym switched tracking on are not here
-- and must not be: that opening balance is estimated, it lives in
-- estimatedHours() in TypeScript, and duplicating the formula in SQL is exactly
-- the drift this project has avoided everywhere else. The caller adds it,
-- passing max(joined_at, the anchor date).
--
-- security_invoker = on, like every view in this project: without it the view
-- would run with its owner's privileges and hand a student everybody's
-- attendance. With it, a student querying this view sees only their own row,
-- because the `attendance` policies say so.
create or replace view public.person_rank_hours
with (security_invoker = on)
as
select
  p.id as person_id,
  count(*) filter (
    where a.present and s.session_date >= p.rank_since
  ) as lessons_since_rank,
  count(*) filter (
    where a.present and s.session_date >= p.stripe_since
  ) as lessons_since_stripe
from public.person p
left join public.attendance a on a.person_id = p.id
left join public.class_session s on s.id = a.session_id
group by p.id;

grant select on public.person_rank_hours to authenticated;
