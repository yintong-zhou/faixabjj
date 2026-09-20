-- Restores current_access() to the four-flag shape.
--
-- Why this file exists. 20260911120000_role_based_access.sql creates
-- current_access() with three flags — canViewRegistry, canEditRegistry,
-- canManageUsers — because can_manage_classes() did not exist yet;
-- 20260912010000_class_schedule_access.sql then replaces the function with the
-- four-flag version. Applied in name order from an empty database that is
-- correct, but the migrations here are pasted into the SQL Editor by hand, and
-- re-pasting 20260911120000 on its own (as happened while making the policy
-- statements idempotent) silently reverts the function to three flags.
--
-- The missing key reads as false in getAccess(), so canManageClasses is false
-- for everybody: an instructor, a maestro and an admin all lose Corsi and the
-- gym dashboard and fall back to the member view, while the Registro — which
-- hangs on canViewRegistry — keeps working. That asymmetry is the signature of
-- this fault.
--
-- This file sorts after both, so it is the last word whatever order the earlier
-- two were applied in. It restates the definition rather than editing either of
-- them: an applied migration is not rewritten, and 20260911120000 genuinely
-- cannot name a function that does not exist at its point in the history.

create or replace function public.current_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'canViewRegistry', public.can_view_registry(),
    'canEditRegistry', public.can_edit_registry(),
    'canManageUsers', public.can_manage_users(),
    'canManageClasses', public.can_manage_classes()
  );
$$;

-- Re-granted for the same reason: a hand-applied subset of the history can
-- leave a function in place with its grant missing, and getAccess() fails
-- closed, so a missing grant is indistinguishable from having no role.
grant execute on function public.current_person_id() to authenticated;
grant execute on function public.has_active_role(text[]) to authenticated;
grant execute on function public.can_view_registry() to authenticated;
grant execute on function public.can_edit_registry() to authenticated;
grant execute on function public.can_manage_users() to authenticated;
grant execute on function public.can_manage_classes() to authenticated;
grant execute on function public.current_access() to authenticated;
