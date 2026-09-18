-- FAIXABJJ — promotion history
--
-- What was decided, when, by whom, and from what to what. This is the record a
-- promotion has to leave behind: six months later nobody remembers whether a
-- purple belt was given in March or in June, and "how long at this belt" is the
-- figure the next promotion hangs on.
create table if not exists public.promotion (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.person (id) on delete cascade,
  from_belt belt_rank not null,
  from_stripes smallint not null check (from_stripes between 0 and 4),
  to_belt belt_rank not null,
  to_stripes smallint not null check (to_stripes between 0 and 4),
  promoted_on date not null default current_date,
  -- The gym's record outlives the account of whoever signed it, exactly as a
  -- member's attendance outlives their login. Same reasoning as "revoca accesso".
  promoted_by uuid references public.person (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists promotion_person_id_idx
  on public.promotion (person_id, promoted_on desc);

alter table public.promotion enable row level security;

-- A member reads their own history: it is a record about them, and the member
-- detail page shows it back to them nowhere else.
drop policy if exists "staff or self can select promotion" on public.promotion;
create policy "staff or self can select promotion" on public.promotion
  for select to authenticated
  using (public.can_view_registry() or person_id = public.current_person_id());

-- Writing is registry-editor business: an instructor runs the classes and must
-- never change anybody's belt. Same split as can_manage_classes vs
-- can_edit_registry everywhere else.
drop policy if exists "editors can insert promotion" on public.promotion;
create policy "editors can insert promotion" on public.promotion
  for insert to authenticated
  with check (public.can_edit_registry());

-- Delete but no update: a promotion entered by mistake is removed and redone.
-- Rewriting one in place would erase the only trace of what was decided, which
-- is the single thing this table exists to keep.
drop policy if exists "editors can delete promotion" on public.promotion;
create policy "editors can delete promotion" on public.promotion
  for delete to authenticated
  using (public.can_edit_registry());

grant select, insert, delete on public.promotion to authenticated;
