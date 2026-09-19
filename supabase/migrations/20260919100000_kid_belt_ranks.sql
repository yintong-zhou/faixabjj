-- FAIXABJJ — the children's belts join belt_rank
--
-- belt-criteria.md carries the IBJJF children's and youth system (ages 4-15):
-- four colour groups, each with three grades — a white-striped belt, the plain
-- colour, and a black-striped one. Until now the enum held only the five adult
-- belts, so a child in the registry could only be recorded as "white".
--
-- ⚠️ THIS MIGRATION DOES NOTHING BUT ADD THE VALUES, and that is the point.
-- Postgres refuses to *use* an enum value in the same transaction that adds it,
-- so anything that mentions 'gray_white' and friends — seeding, a function
-- body, a check constraint — has to wait for a later migration. The same rule
-- is why the `admin` role is never written as a literal in the migration that
-- adds it. Apply this one, then 20260919110000.
--
-- The spelling is "gray", matching the artwork in frontend/public/belts/kids
-- and the project's rule that the enum value is the filename. belt-criteria.md
-- writes "grey" in prose; that is the English word, not an identifier.
--
-- `if not exists` so a partial application can be re-run safely.
alter type belt_rank add value if not exists 'gray_white' after 'white';
alter type belt_rank add value if not exists 'gray' after 'gray_white';
alter type belt_rank add value if not exists 'gray_black' after 'gray';
alter type belt_rank add value if not exists 'yellow_white' after 'gray_black';
alter type belt_rank add value if not exists 'yellow' after 'yellow_white';
alter type belt_rank add value if not exists 'yellow_black' after 'yellow';
alter type belt_rank add value if not exists 'orange_white' after 'yellow_black';
alter type belt_rank add value if not exists 'orange' after 'orange_white';
alter type belt_rank add value if not exists 'orange_black' after 'orange';
alter type belt_rank add value if not exists 'green_white' after 'orange_black';
alter type belt_rank add value if not exists 'green' after 'green_white';
alter type belt_rank add value if not exists 'green_black' after 'green';

-- The values are inserted between 'white' and 'blue' so that a plain
-- `order by current_belt` sorts a roll call the way the app does. The app does
-- not depend on it — beltRank() in utils/supabase/profile.ts owns that order —
-- but an enum whose declared order contradicts the domain is a trap for the
-- next person writing a query by hand.
