-- Runtime check of the promotion rules, run as the users they are about.
--
-- Run in the SQL Editor of project poksgledkecwviypspmi, in one go. It opens a
-- transaction, impersonates real accounts, exercises every refusal and both
-- accepted cases, prints a table of results and then ROLLS BACK: nothing it
-- does survives. The final `rollback` is what makes it safe to run on the live
-- database, so do not run the statements one at a time and do not stop halfway.
--
-- Why impersonation. record_promotion() is security invoker and re-checks
-- can_edit_registry(), and the policies it writes through key off auth.uid().
-- The SQL Editor connects as a superuser with no JWT, where auth.uid() is null,
-- every predicate is false and RLS does not apply — so running these calls
-- plainly would test nothing the app does. set_config('request.jwt.claims', …)
-- with role `authenticated` is the same position the PostgREST request is in.
--
-- What it does not cover. The panel's reminders and the suggested next grade
-- are frontend concerns (utils/promotion.ts, unit-tested), and the four-stripe
-- convention binds only the suggestion, never this function. Children staying
-- out of the eligibility queue is likewise decided in TypeScript, from the
-- absence of promotion_criteria rows for their belts — the database has no
-- opinion on eligibility, so there is nothing here to assert about it. Of the
-- policies, only the two reads marked below actually run under RLS; the rest
-- of the cases are about the checks inside record_promotion(), which are
-- explicit raises and fire whatever role is connected.

begin;

create temp table verify_result (
  seq serial,
  area text,
  case_name text,
  outcome text,
  detail text
) on commit drop;

do $$
declare
  v_editor      public.person%rowtype;   -- head_coach or admin, does the promoting
  v_target      public.person%rowtype;   -- gets promoted
  v_student     public.person%rowtype;   -- no technical role
  v_instructor  public.person%rowtype;   -- instructor: runs classes, not belts
  v_before      public.person%rowtype;
  v_after       public.person%rowtype;
  v_id          uuid;
  v_count       bigint;
  v_date        date := (now() at time zone public.gym_timezone())::date;
  v_role        text := current_user;
  v_max         smallint;
begin
  -- -------------------------------------------------------------------------
  -- Find the people to act as. Any of these coming back empty means the check
  -- cannot run, and is reported rather than guessed around.
  -- -------------------------------------------------------------------------
  select p.* into v_editor
  from public.person p
  join public.assigned_role r on r.person_id = p.id and r.end_date is null
  where p.auth_user_id is not null
    and r.role::text in ('head_coach', 'admin')
  limit 1;

  select p.* into v_target
  from public.person p
  join public.assigned_role r on r.person_id = p.id and r.end_date is null
  where p.id <> coalesce(v_editor.id, '00000000-0000-0000-0000-000000000000'::uuid)
  order by p.full_name
  limit 1;

  select p.* into v_student
  from public.person p
  where p.auth_user_id is not null
    and not exists (
      select 1 from public.assigned_role r
      where r.person_id = p.id and r.end_date is null
        and r.role::text in ('instructor', 'head_coach', 'admin')
    )
  limit 1;

  select p.* into v_instructor
  from public.person p
  join public.assigned_role r on r.person_id = p.id and r.end_date is null
  where p.auth_user_id is not null and r.role::text = 'instructor'
  limit 1;

  if v_editor.id is null or v_target.id is null then
    insert into verify_result (area, case_name, outcome, detail)
    values ('setup', 'people found', 'CANNOT RUN',
            'needs an account with head_coach or admin, plus one other person');
    return;
  end if;

  insert into verify_result (area, case_name, outcome, detail)
  values ('setup', 'acting as', 'INFO',
          format('editor=%s, target=%s (%s %s stripes)',
                 v_editor.full_name, v_target.full_name,
                 v_target.current_belt, v_target.current_stripes));

  -- -------------------------------------------------------------------------
  -- Become the editor.
  --
  -- Only the JWT claim is set here, not the database role. auth.uid() reads the
  -- claim, so can_edit_registry() and every check inside record_promotion() see
  -- the real user — which is what these cases are about. The role is switched
  -- to `authenticated` only around the two reads that are genuinely about RLS,
  -- below, because the temp table this writes its results into belongs to the
  -- editor's own session role and `authenticated` cannot insert into it.
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_editor.auth_user_id)::text, true);

  -- 1. A future date. Refused: forward-dating hands somebody free time at rank.
  begin
    v_id := public.record_promotion(
      v_target.id, v_target.current_belt, (v_target.current_stripes + 1)::smallint,
      v_date + 1);
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'future date', 'FAIL', 'accepted, expected SQLSTATE 22007');
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'future date',
            case when sqlstate = '22007' then 'PASS' else 'FAIL' end,
            sqlstate || ' ' || sqlerrm);
  end;

  -- 2. Sideways — the same belt and the same stripes. Refused: correcting a
  --    wrong grade is a different act, and it is not offered here.
  begin
    v_id := public.record_promotion(
      v_target.id, v_target.current_belt, v_target.current_stripes::smallint);
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'sideways', 'FAIL', 'accepted, expected SQLSTATE 23514');
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'sideways',
            case when sqlstate = '23514' then 'PASS' else 'FAIL' end,
            sqlstate || ' ' || sqlerrm);
  end;

  -- 3. Backward — white is the first rung of both ladders, so this is behind
  --    anybody who is not already on it.
  if v_target.current_belt::text <> 'white' then
    begin
      v_id := public.record_promotion(v_target.id, 'white'::public.belt_rank, 0::smallint);
      insert into verify_result (area, case_name, outcome, detail)
      values ('refusals', 'backward', 'FAIL', 'accepted, expected SQLSTATE 23514');
    exception when others then
      insert into verify_result (area, case_name, outcome, detail)
      values ('refusals', 'backward',
              case when sqlstate = '23514' then 'PASS' else 'FAIL' end,
              sqlstate || ' ' || sqlerrm);
    end;
  else
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'backward', 'SKIPPED', 'target is already on white');
  end if;

  -- 4. Five stripes on an adult belt. Four is the maximum.
  begin
    v_id := public.record_promotion(v_target.id, 'blue'::public.belt_rank, 5::smallint);
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'stripes above 4', 'FAIL', 'accepted, expected SQLSTATE 23514');
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'stripes above 4',
            case when sqlstate = '23514' then 'PASS' else 'FAIL' end,
            sqlstate || ' ' || sqlerrm);
  end;

  -- 5. Four stripes on a children's belt. Three is the maximum there — it is
  --    what the artwork draws and what KID_MAX_STRIPES says in the app.
  begin
    v_id := public.record_promotion(v_target.id, 'gray_white'::public.belt_rank, 4::smallint);
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'kid belt, 4 stripes', 'FAIL', 'accepted, expected SQLSTATE 23514');
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'kid belt, 4 stripes',
            case when sqlstate = '23514' then 'PASS' else 'FAIL' end,
            sqlstate || ' ' || sqlerrm);
  end;

  -- 6. A stripe on the black belt. It has degrees, not stripes.
  begin
    v_id := public.record_promotion(v_target.id, 'black'::public.belt_rank, 1::smallint);
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'black with stripes', 'FAIL', 'accepted, expected SQLSTATE 23514');
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'black with stripes',
            case when sqlstate = '23514' then 'PASS' else 'FAIL' end,
            sqlstate || ' ' || sqlerrm);
  end;

  -- 7. Promoting yourself. A history row whose subject and signer are the same
  --    person is a self-award wearing the shape of a decision.
  begin
    v_id := public.record_promotion(
      v_editor.id, v_editor.current_belt, (v_editor.current_stripes + 1)::smallint);
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'self promotion', 'FAIL', 'accepted, expected SQLSTATE 42501');
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('refusals', 'self promotion',
            case when sqlstate = '42501' then 'PASS' else 'FAIL' end,
            sqlstate || ' ' || sqlerrm);
  end;

  -- -------------------------------------------------------------------------
  -- Accepted: a stripe, backdated. The belt date must not move — "how long at
  -- this belt" is what the next belt hangs on.
  -- -------------------------------------------------------------------------
  select * into v_before from public.person where id = v_target.id;
  -- Only if there is a stripe left to give on this belt: a target already at
  -- the top of their belt would be refused, correctly, and the accepted case
  -- would report a failure that is really a badly chosen target.
  --
  -- The maximum is computed into a variable rather than written inline in the
  -- IF: plpgsql ends an IF condition at the first `then` it meets, which a CASE
  -- expression carries inside itself, and the whole block then fails to parse.
  v_max := case
    when v_before.current_belt::text = 'black' then 0
    when v_before.current_belt::text like any (array['gray%', 'yellow%', 'orange%', 'green%']) then 3
    else 4
  end;

  if v_before.current_stripes >= v_max then
    insert into verify_result (area, case_name, outcome, detail)
    values ('a stripe', 'accepted', 'SKIPPED',
            format('%s already has every stripe on %s',
                   v_before.full_name, v_before.current_belt));
  else
  begin
    v_id := public.record_promotion(
      v_target.id, v_before.current_belt, (v_before.current_stripes + 1)::smallint,
      v_date - 7, 'verify-promotions.sql');
    select * into v_after from public.person where id = v_target.id;

    insert into verify_result (area, case_name, outcome, detail)
    values ('a stripe', 'stripe_since moves, rank_since does not',
            case when v_after.stripe_since = v_date - 7
                  and v_after.rank_since = v_before.rank_since
                  and v_after.current_stripes = v_before.current_stripes + 1
                 then 'PASS' else 'FAIL' end,
            format('rank_since %s -> %s, stripe_since %s -> %s, stripes %s -> %s',
                   v_before.rank_since, v_after.rank_since,
                   v_before.stripe_since, v_after.stripe_since,
                   v_before.current_stripes, v_after.current_stripes));

    select count(*) into v_count from public.promotion
    where id = v_id and promoted_by = v_editor.id;
    insert into verify_result (area, case_name, outcome, detail)
    values ('a stripe', 'history row signed by the editor',
            case when v_count = 1 then 'PASS' else 'FAIL' end,
            format('%s row(s)', v_count));
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('a stripe', 'accepted', 'FAIL', sqlstate || ' ' || sqlerrm);
  end;
  end if;

  -- -------------------------------------------------------------------------
  -- Accepted: a belt. Both dates move and the stripe count resets to the one
  -- given.
  -- -------------------------------------------------------------------------
  select * into v_before from public.person where id = v_target.id;
  if v_before.current_belt::text = 'black' then
    insert into verify_result (area, case_name, outcome, detail)
    values ('a belt', 'accepted', 'SKIPPED',
            format('%s is already a black belt', v_before.full_name));
  else
  begin
    v_id := public.record_promotion(
      v_target.id, 'black'::public.belt_rank, 0::smallint, v_date,
      'verify-promotions.sql');
    select * into v_after from public.person where id = v_target.id;

    insert into verify_result (area, case_name, outcome, detail)
    values ('a belt', 'both dates move, stripes reset',
            case when v_after.rank_since = v_date
                  and v_after.stripe_since = v_date
                  and v_after.current_stripes = 0
                  and v_after.current_belt::text = 'black'
                 then 'PASS' else 'FAIL' end,
            format('belt %s -> %s, rank_since %s -> %s, stripes %s -> %s',
                   v_before.current_belt, v_after.current_belt,
                   v_before.rank_since, v_after.rank_since,
                   v_before.current_stripes, v_after.current_stripes));
  exception when others then
    insert into verify_result (area, case_name, outcome, detail)
    values ('a belt', 'accepted', 'FAIL', sqlstate || ' ' || sqlerrm);
  end;
  end if;

  -- -------------------------------------------------------------------------
  -- What a student can read. The rule is that nothing a member can open states
  -- a remaining amount, a next grade or a verdict — which is why the criteria
  -- are restricted in the database and not merely hidden in the UI.
  -- -------------------------------------------------------------------------
  if v_student.id is null then
    insert into verify_result (area, case_name, outcome, detail)
    values ('a student', 'reads no criteria', 'SKIPPED', 'no student account found');
  else
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_student.auth_user_id)::text, true);

    -- These two are about RLS, so the role has to be `authenticated` for the
    -- policies to apply at all — as a superuser every policy is bypassed and
    -- both counts would come back as the whole table, failing for the wrong
    -- reason. Switched back immediately afterwards, before the result rows are
    -- written.
    begin
      perform set_config('role', 'authenticated', true);
      select count(*) into v_count from public.promotion_criteria;
      perform set_config('role', v_role, true);
    exception when others then
      -- -1 marks the read itself as refused, which is not the same answer as
      -- reading nothing: a missing table grant and an empty result both look
      -- like zero otherwise.
      perform set_config('role', v_role, true);
      v_count := -1;
    end;

    insert into verify_result (area, case_name, outcome, detail)
    values ('a student', 'reads no criteria',
            case when v_count = 0 then 'PASS' else 'FAIL' end,
            format('%s row(s) visible, expected 0', v_count));

    begin
      perform set_config('role', 'authenticated', true);
      select count(*) into v_count from public.member_overview;
      perform set_config('role', v_role, true);
    exception when others then
      -- -1 marks the read itself as refused, which is not the same answer as
      -- reading nothing: a missing table grant and an empty result both look
      -- like zero otherwise.
      perform set_config('role', v_role, true);
      v_count := -1;
    end;

    insert into verify_result (area, case_name, outcome, detail)
    values ('a student', 'reads only their own row',
            case when v_count <= 1 then 'PASS' else 'FAIL' end,
            format('%s row(s) visible, expected at most 1', v_count));

    begin
      v_id := public.record_promotion(
        v_target.id, 'black'::public.belt_rank, 0::smallint);
      insert into verify_result (area, case_name, outcome, detail)
      values ('a student', 'cannot promote', 'FAIL', 'accepted, expected SQLSTATE 42501');
    exception when others then
      insert into verify_result (area, case_name, outcome, detail)
      values ('a student', 'cannot promote',
              case when sqlstate = '42501' then 'PASS' else 'FAIL' end,
              sqlstate || ' ' || sqlerrm);
    end;
  end if;

  -- -------------------------------------------------------------------------
  -- An instructor runs the classes and must never change a belt. Two
  -- privileges, two predicates.
  -- -------------------------------------------------------------------------
  if v_instructor.id is null then
    insert into verify_result (area, case_name, outcome, detail)
    values ('an instructor', 'cannot promote', 'SKIPPED', 'no instructor account found');
  else
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_instructor.auth_user_id)::text, true);

    insert into verify_result (area, case_name, outcome, detail)
    values ('an instructor', 'predicates',
            case when public.can_view_registry()
                  and public.can_manage_classes()
                  and not public.can_edit_registry()
                 then 'PASS' else 'FAIL' end,
            format('view=%s classes=%s edit=%s',
                   public.can_view_registry(), public.can_manage_classes(),
                   public.can_edit_registry()));

    begin
      v_id := public.record_promotion(
        v_target.id, 'black'::public.belt_rank, 0::smallint);
      insert into verify_result (area, case_name, outcome, detail)
      values ('an instructor', 'cannot promote', 'FAIL',
              'accepted, expected SQLSTATE 42501');
    exception when others then
      insert into verify_result (area, case_name, outcome, detail)
      values ('an instructor', 'cannot promote',
              case when sqlstate = '42501' then 'PASS' else 'FAIL' end,
              sqlstate || ' ' || sqlerrm);
    end;
  end if;

  perform set_config('role', v_role, true);
end;
$$;

select area, case_name, outcome, detail
from verify_result
order by seq;

-- Everything above is undone here. Do not replace this with `commit`.
rollback;
