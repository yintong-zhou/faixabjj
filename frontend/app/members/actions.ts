"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, MissingSecretKeyError } from "@/utils/supabase/admin";
import {
  requirePromoter,
  requireRankDateCorrector,
  requireRegistryEditor,
  requireUserManager,
} from "@/utils/supabase/require-admin";
import { getDictionary } from "@/utils/i18n/server";
import { generateTemporaryPassword } from "@/utils/temporary-password";
import { claimUsername } from "@/utils/supabase/username";
import { isValidUsername, normalizeUsername, suggestUsername } from "@/utils/username";
import { flashTemporaryPassword } from "@/utils/temporary-password-flash";
import { todayIn } from "@/utils/dates";
import { logDbError } from "@/utils/log";
import { PORTAL_ONLY_ROLE } from "@/utils/members";
import { requireGymSettings } from "@/utils/supabase/gym";
import { BELT_ORDER, roleLabel } from "@/utils/supabase/profile";

const PATH = "/members";
const CRITERIA_PATH = "/members/criteria";

// Filters and the current page live in the URL, so every action carries them
// back — otherwise acting on a row would silently reset the list you were
// looking at.
function back(params: Record<string, string>, query?: string) {
  const search = new URLSearchParams(query ?? "");
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  redirect(`${PATH}?${search.toString()}`);
}

// The criteria editor is its own page, so its action returns there rather than
// to the list. `from` is the Registro's query string, carried through so the
// page's back link still leads to the list the editor was opened from — it is
// never applied to this redirect's own parameters.
function backToCriteria(params: Record<string, string>, from?: string) {
  const search = new URLSearchParams();
  if (from) search.set("from", from);
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  redirect(`${CRITERIA_PATH}?${search.toString()}`);
}

const ASSIGNABLE_ROLES = [
  "student",
  "assistant",
  "instructor",
  "head_coach",
  "admin",
] as const;

// All seventeen belts, children's ladder included — imported rather than
// listed here, because a second copy of the ladder is how the two stop
// matching. They did: this was still the five adult belts after the children's
// system landed, so the panel offered a grey belt and this check refused it.
const isBelt = (value: string) =>
  (BELT_ORDER as readonly string[]).includes(value);

const text = (formData: FormData, key: string) => {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : null;
};

const number = (formData: FormData, key: string): number | null => {
  const raw = (formData.get(key) as string | null)?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// The service-role client below bypasses RLS, so before acting on an account
// every action asks the *user's* client whether the target is one of the
// caller's own people. RLS answers only inside the caller's gym: a user_id or
// person_id from another gym, typed into a crafted POST, comes back empty.
//
// Selects email/full_name too, not just id/auth_user_id: restoreAccess reads
// the account address and name off this row rather than trusting the form's
// own fields, which a caller could otherwise set to someone else's address.
async function personInMyGym(
  supabase: SupabaseClient,
  filter: { authUserId: string } | { personId: string },
): Promise<{
  id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
  username: string | null;
} | null> {
  const query = supabase
    .from("person")
    .select("id, auth_user_id, email, full_name, username");
  const { data, error } = await ("authUserId" in filter
    ? query.eq("auth_user_id", filter.authUserId)
    : query.eq("id", filter.personId)
  ).maybeSingle();
  if (error) logDbError("members", "personInMyGym", error);
  return (
    (data as {
      id: string;
      auth_user_id: string | null;
      email: string | null;
      full_name: string | null;
      username: string | null;
    } | null) ?? null
  );
}

// Belt and braces for the actions that change or delete an account with the
// service role. personInMyGym() rests on person.auth_user_id, which the
// database now refuses to point at somebody else's account
// (guard_person_auth_user); this checks the account itself as well, so a row
// linked by any other route still cannot reach it. The account must say it
// belongs to the caller's gym in its own app_metadata — written only by the
// service role — and must not be a platform superadmin.
async function accountInMyGym(
  supabase: SupabaseClient,
  admin: ReturnType<typeof createAdminClient>,
  targetId: string,
): Promise<boolean> {
  const { data: gymId, error: gymIdError } = await supabase.rpc("current_gym_id");
  if (gymIdError) logDbError("members", "accountInMyGym:current_gym_id", gymIdError);
  if (!gymId) return false;

  const { data: platformAdmin, error: platformAdminError } = await admin
    .from("platform_admin")
    .select("auth_user_id")
    .eq("auth_user_id", targetId)
    .maybeSingle();
  if (platformAdminError) {
    logDbError("members", "accountInMyGym:platform_admin", platformAdminError);
    return false;
  }
  if (platformAdmin) {
    console.error("[members] account action refused: target is a platform admin");
    return false;
  }

  const { data, error } = await admin.auth.admin.getUserById(targetId);
  if (error || !data?.user) {
    logDbError(
      "members",
      "accountInMyGym:getUserById",
      error
        ? { code: error.code ?? null, message: error.message }
        : { code: "no-user", message: "no user returned" },
    );
    return false;
  }
  const accountGymId = (data.user.app_metadata as { gym_id?: string } | undefined)?.gym_id;
  if (accountGymId !== gymId) {
    console.error("[members] account action refused: account belongs to another gym");
    return false;
  }
  return true;
}

// Adds a member to the registry *and* creates their login account in one act.
//
// The account is created with a temporary password drawn for it alone and shown
// once to the maestro, its address marked confirmed so no email is sent and
// nothing has to be clicked, and `must_change_password` set — which the proxy
// and requireAdmin enforce, so the member replaces it before anything else in
// the app opens.
//
// Order matters: the auth user is created first, because that is the step that
// can fail on a duplicate email. Doing it after the registry insert would leave
// a person row behind with no account whenever the address is already taken.
export async function addPerson(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const query = (formData.get("_query") as string | null) ?? "";

  // Required: name, email, role, join date and belt. Checked here and not only
  // through the form's `required` attributes, which a crafted POST skips.
  const fullName = text(formData, "full_name");
  if (!fullName) {
    back({ error: t.msg.nameRequired }, query);
    return;
  }

  const email = text(formData, "email");
  if (!email) {
    back({ error: t.msg.emailRequired }, query);
    return;
  }

  const joinedAt = text(formData, "joined_at");
  if (!joinedAt) {
    back({ error: t.msg.joinDateRequired }, query);
    return;
  }

  const role = formData.get("role") as string;
  if (!ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    back({ error: t.msg.pickRole }, query);
    return;
  }

  // An admin runs the portal and does not train, so they hold no rank: the
  // belt is neither asked for nor stored, and the rank columns keep their
  // defaults. Asking for one would record a grade nobody was given.
  const portalOnly = role === PORTAL_ONLY_ROLE;

  const belt = formData.get("current_belt") as string;
  if (!portalOnly && !isBelt(belt)) {
    back({ error: t.msg.pickBelt }, query);
    return;
  }

  const stripes = Number.parseInt((formData.get("current_stripes") as string) ?? "0", 10);
  if (!portalOnly && (!Number.isInteger(stripes) || stripes < 0 || stripes > 4)) {
    back({ error: t.msg.stripesRange }, query);
    return;
  }

  // Proposed by the form from the name; suggested here too when it arrives
  // empty (no JavaScript). Checked before the account exists, so a bad value
  // never leaves a half-created account.
  const username = normalizeUsername(text(formData, "username") ?? "") || suggestUsername(fullName);
  if (!isValidUsername(username)) {
    back({ error: t.msg.usernameInvalid }, query);
    return;
  }

  // The new account belongs to the caller's gym, named in app_metadata where
  // the member cannot change it; the auth trigger creates the person row there.
  const { data: gymId, error: gymIdError } = await supabase.rpc("current_gym_id");
  if (gymIdError) logDbError("members", "addPerson:current_gym_id", gymIdError);
  if (!gymId) {
    back({ error: t.msg.accountNotCreated }, query);
    return;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (cause) {
    back(
      {
        error:
          cause instanceof MissingSecretKeyError
            ? t.msg.secretMissingCreate
            : t.msg.adminClientMissing,
      },
      query,
    );
    return;
  }

  const password = generateTemporaryPassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    // Marks the address confirmed at creation: no verification email is sent
    // and the account is usable immediately.
    email_confirm: true,
    user_metadata: { full_name: fullName },
    // app_metadata, not user_metadata: the member must not be able to clear
    // their own obligation by editing their profile.
    app_metadata: { must_change_password: true, gym_id: gymId },
  });

  if (authError || !created?.user) {
    back(
      { error: t.msg.accountNotCreated },
      query,
    );
    return;
  }

  // The on_auth_user_created trigger has just created the matching `person`
  // row from the metadata above; fill in the rest of the form.
  //
  // With the service role, not the user's client: the database lets a belt
  // change only inside record_promotion() (20260927000000), and the starting
  // belt is not a promotion. The row is addressed by the account created a few
  // lines up and by the caller's own gym, so this reaches nobody else.
  const { data: person, error } = await admin
    .from("person")
    .update({
      full_name: fullName,
      phone: text(formData, "phone"),
      birth_date: text(formData, "birth_date"),
      joined_at: joinedAt,
      // Optional: left to the column defaults (today) when the field is empty.
      // An admin-only account skips the whole rank block for the reason above.
      ...(portalOnly
        ? {}
        : {
            ...(text(formData, "rank_since")
              ? { rank_since: text(formData, "rank_since") }
              : {}),
            ...(text(formData, "stripe_since")
              ? { stripe_since: text(formData, "stripe_since") }
              : {}),
            current_belt: belt,
            current_stripes: stripes,
          }),
      notes: text(formData, "notes"),
    })
    .eq("auth_user_id", created.user.id)
    .eq("gym_id", gymId as string)
    .select("id")
    .maybeSingle();

  if (error) logDbError("members", "addPerson:profile", error);
  if (error || !person) {
    back(
      {
        error: t.msg.accountCreatedNoProfile(email),
      },
      query,
    );
    return;
  }

  const claimed = await claimUsername(admin, person.id, username);
  if (!claimed) {
    back({ error: t.msg.accountCreatedNoProfile(email) }, query);
    return;
  }

  const { error: roleError } = await supabase
    .from("assigned_role")
    .insert({ person_id: person.id, role });

  if (roleError) {
    back(
      { error: t.msg.personAddedNoRole(fullName) },
      query,
    );
    return;
  }

  revalidatePath(PATH);
  back(
    {
      ok: t.msg.personAdded(fullName),
      pw: await flashTemporaryPassword({ email, password, username: claimed }),
    },
    query,
  );
}

// Gives portal access back to someone in the registry who has none — in
// practice a member whose access was revoked, since addPerson creates the
// account up front. It works exactly like addPerson: a fresh temporary password
// drawn for this account alone, shown once to the maestro to pass on by a
// channel of their own, no email, the address confirmed at creation, and
// must_change_password armed so the member replaces it at first login.
//
// The account is created with no gym in its app_metadata, so the auth trigger
// (20260925050000) neither creates a second person row nor links by email —
// which, with two account-less rows sharing an address, could pick the wrong
// one. The row is linked here, by id, and only then does the gym go into
// app_metadata (the trigger then finds the row linked and does nothing).
//
// Any step after createUser that fails deletes the new account again. That
// covers the race with deletePerson too: if the row is deleted between the
// check below and the link, the link matches no row and no orphan account is
// left behind. Once linked, the row cannot be deleted (20260928000000).
export async function restoreAccess(formData: FormData) {
  const { t } = await getDictionary();
  // The admin client below uses the secret key, which bypasses Row Level
  // Security entirely, so the database will not enforce the privilege here.
  const { supabase } = await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const personId = (formData.get("person_id") as string | null) ?? "";

  // The address and name come from the looked-up row, never from the form, so
  // a crafted POST cannot pair an account-less own-gym person_id with a
  // different person's email address.
  const target = personId ? await personInMyGym(supabase, { personId }) : null;
  const { data: gymId, error: gymIdError } = await supabase.rpc("current_gym_id");
  if (gymIdError) logDbError("members", "restoreAccess:current_gym_id", gymIdError);
  if (!target || target.auth_user_id || !gymId) {
    back({ error: t.msg.userNotInGym }, query);
    return;
  }

  const email = target.email;
  if (!email) {
    back({ error: t.msg.emailNeededToRestore }, query);
    return;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (cause) {
    back(
      {
        error:
          cause instanceof MissingSecretKeyError
            ? t.msg.secretMissingRestore
            : t.msg.adminClientMissing,
      },
      query,
    );
    return;
  }

  const password = generateTemporaryPassword();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: target.full_name ?? "" },
    app_metadata: { must_change_password: true },
  });

  if (authError || !created?.user) {
    back({ error: t.msg.restoreAccessFailed }, query);
    return;
  }
  const userId = created.user.id;

  const undo = async (step: string, cause: { code?: string; message: string }) => {
    logDbError("members", `restoreAccess:${step}`, cause);
    const { error: undoError } = await admin.auth.admin.deleteUser(userId);
    if (undoError) logDbError("members", "restoreAccess:undo", undoError);
    back({ error: t.msg.restoreAccessFailed }, query);
  };

  // `.update()` reports no error when the filter matches nothing, so an empty
  // result — the row was deleted, or linked by someone else, since the check
  // above — is a failure too.
  const { data: linked, error: linkError } = await admin
    .from("person")
    .update({ auth_user_id: userId })
    .eq("id", target.id)
    .eq("gym_id", gymId as string)
    .is("auth_user_id", null)
    .select("id");

  if (linkError || !linked || linked.length === 0) {
    await undo("link", linkError ?? { code: "no-rows", message: "link matched no rows" });
    return;
  }

  // A row revoked after usernames existed keeps its own; an older one gets
  // one from the name, as the backfill would have given it.
  const username =
    target.username ?? (await claimUsername(admin, target.id, suggestUsername(target.full_name ?? "")));
  if (!username) {
    await undo("username", { code: "no-username", message: "claimUsername found no free username" });
    return;
  }

  const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { must_change_password: true, gym_id: gymId },
  });

  if (metaError) {
    await undo("meta", metaError);
    return;
  }

  revalidatePath(PATH);
  back(
    {
      ok: t.msg.accessRestored(target.full_name?.trim() || email),
      pw: await flashTemporaryPassword({ email, password, username }),
    },
    query,
  );
}

// Gives a member a fresh temporary password, rather than emailing a recovery
// link — drawn for this account alone and shown once to the maestro, exactly as
// addPerson does. It is provisional by construction: setting it re-arms
// must_change_password, so the member has to replace it at their next login
// like a freshly created account.
export async function setTemporaryPassword(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const targetId = formData.get("user_id") as string;

  if (!targetId) {
    back({ error: t.msg.userNotSpecified }, query);
    return;
  }

  const person = await personInMyGym(supabase, { authUserId: targetId });
  if (!person) {
    back({ error: t.msg.userNotInGym }, query);
    return;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    back(
      { error: t.msg.secretMissingReset },
      query,
    );
    return;
  }

  if (!(await accountInMyGym(supabase, admin, targetId))) {
    back({ error: t.msg.userNotInGym }, query);
    return;
  }

  const password = generateTemporaryPassword();
  const { data, error } = await admin.auth.admin.updateUserById(targetId, {
    password,
    app_metadata: { must_change_password: true },
  });

  if (error || !data?.user) {
    back({ error: t.msg.resetFailed }, query);
    return;
  }

  // The message names the person, the way the maestro knows them; the email
  // belongs in the credentials block, where it is a field to pass on.
  const email = data.user.email ?? t.msg.someUser;
  const who = person.full_name?.trim() || email;
  back(
    {
      ok: t.msg.passwordReset(who),
      pw: await flashTemporaryPassword({ email, password, username: person.username }),
    },
    query,
  );
}

export async function revokeAccess(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase, userId: currentUserId } = await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const targetId = formData.get("user_id") as string;

  if (!targetId) {
    back({ error: t.msg.userNotSpecified }, query);
    return;
  }

  // Removing your own access would lock you out mid-session, and if you were
  // the last manager it would leave the portal with nobody able to invite.
  if (targetId === currentUserId) {
    back({ error: t.msg.cannotRevokeSelf }, query);
    return;
  }

  if (!(await personInMyGym(supabase, { authUserId: targetId }))) {
    back({ error: t.msg.userNotInGym }, query);
    return;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    back(
      { error: t.msg.secretMissingRevoke },
      query,
    );
    return;
  }

  if (!(await accountInMyGym(supabase, admin, targetId))) {
    back({ error: t.msg.userNotInGym }, query);
    return;
  }

  // Deletes the auth account only. `person.auth_user_id` is ON DELETE SET
  // NULL, so the registry row and its attendance history survive as an
  // account-less member — revoking access must not erase the gym's records.
  const { error } = await admin.auth.admin.deleteUser(targetId);

  if (error) {
    back({ error: t.msg.revokeFailed }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.accessRevoked }, query);
}

// Deletes a person from the registry for good — the step after revokeAccess,
// for somebody who has left. Their attendance, roles and promotion history go
// with the row (ON DELETE CASCADE), so it is offered only once the account is
// gone, and the database holds the same line: the delete policy
// (20260928000000) refuses a row still linked to an account.
//
// The user's own client, not the service role: RLS is the boundary here —
// user managers only, inside their own gym — and requireUserManager is the
// early, clear refusal. Posted from the Registro's row menu and from the detail
// page; both hand the list's query back, so the redirect lands on the list the
// person was deleted from.
export async function deletePerson(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const personId = (formData.get("person_id") as string | null) ?? "";

  const target = personId ? await personInMyGym(supabase, { personId }) : null;
  if (!target) {
    back({ error: t.msg.userNotInGym }, query);
    return;
  }
  if (target.auth_user_id) {
    back({ error: t.msg.deleteNeedsRevoke }, query);
    return;
  }

  // Re-stated in the filter: an account linked between the check above and
  // here matches no row, and the zero-row result is treated as a failure.
  const { data, error } = await supabase
    .from("person")
    .delete()
    .eq("id", target.id)
    .is("auth_user_id", null)
    .select("id");

  if (error || !data || data.length === 0) {
    logDbError(
      "members",
      "deletePerson",
      error ?? { code: "no-rows", message: "delete matched no rows" },
    );
    back({ error: t.msg.deleteFailed }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.personDeleted(target.full_name ?? "") }, query);
}

// Recording a promotion is one RPC, not two writes: updating the person row
// and inserting the history row have to happen together, and record_promotion()
// does both in one transaction. The function is security *invoker*, so RLS and
// the guard trigger still apply. Head coach only (20261005010000) — not the gym
// manager, not an instructor; requirePromoter here is the early, clear refusal,
// not the security boundary.
export async function recordPromotion(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requirePromoter(PATH);

  const personId = text(formData, "person_id");
  const toBelt = text(formData, "to_belt");
  const promotedOn = text(formData, "promoted_on");
  const toStripes = Number.parseInt(
    (formData.get("to_stripes") as string) ?? "0",
    10,
  );

  if (!personId || !toBelt || !isBelt(toBelt)) {
    redirect(`/members/${personId ?? ""}?error=${encodeURIComponent(t.msg.promotionFailed)}`);
  }

  const { error } = await supabase.rpc("record_promotion", {
    p_person_id: personId,
    p_to_belt: toBelt,
    p_to_stripes: Number.isFinite(toStripes) ? toStripes : 0,
    p_promoted_on: promotedOn ?? undefined,
    p_notes: text(formData, "notes"),
  });

  if (error) {
    // 23514 is the function's own check violations — forward-only, stripes out
    // of range, stripes on a black belt. They are the one case the user can act
    // on, so they get their own message; everything else is generic and the
    // real reason goes to the server log.
    const message =
      error.code === "23514" ? t.msg.promotionNotForward : t.msg.promotionFailed;
    logDbError("members", "recordPromotion", error);
    redirect(`/members/${personId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/members/${personId}`);
  // The Registro carries the eligibility count and the `idonei` filter, so a
  // promotion changes what that list shows.
  revalidatePath(PATH);
  redirect(`/members/${personId}?ok=${encodeURIComponent(t.msg.promotionRecorded)}`);
}

// Back to a member's detail page with a flash message, keeping the list filters
// the page was opened from (`_from`) so its back link still works.
function detailRedirect(personId: string | null, formData: FormData) {
  const fromQuery = (formData.get("_from") as string | null) ?? "";

  return (params: Record<string, string>) => {
    const search = new URLSearchParams();
    if (fromQuery) search.set("from", fromQuery);
    for (const [key, value] of Object.entries(params)) search.set(key, value);
    redirect(`/members/${personId ?? ""}?${search.toString()}`);
  };
}

// Corrects the two dates a member's progress is measured from.
//
// This is NOT a promotion and deliberately writes no history row: nothing was
// awarded, a date that was typed wrong is being fixed — the belt arrived from
// another academy and the join form guessed, or somebody entered the stripe
// date where the belt date belonged. record_promotion() stays the only way a
// grade changes, so the promotion table keeps meaning "what was decided, and
// when", and a correction never masquerades as a decision.
//
// Head coach and instructor only, never the gym manager (admin), who keeps
// the join date (20261005000000). Backdating `rank_since` is the cleanest way
// to fake eligibility, so guard_person_auth_link freezes both dates outside
// correct_rank_dates() and record_promotion(). The function is security
// definer — an instructor has no update right on person — and re-checks the
// role, the gym, the caller's own row and the two date rules below;
// requireRankDateCorrector here is the early, clear refusal.
export async function correctRankDates(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRankDateCorrector(PATH);

  const personId = text(formData, "person_id");
  const detail = detailRedirect(personId, formData);

  const rankSince = text(formData, "rank_since");
  const stripeSince = text(formData, "stripe_since");

  if (!personId || !rankSince || !stripeSince) {
    detail({ error: t.msg.datesFailed });
    return;
  }

  // Compared as ISO strings, which sort chronologically, and against the gym's
  // own "today" rather than the browser's — the date arrives as text and a
  // crafted POST is not bound by the input's `max`.
  const today = todayIn((await requireGymSettings()).timezone);
  if (rankSince > today || stripeSince > today) {
    detail({ error: t.msg.dateInFuture });
    return;
  }

  // A stripe is awarded on a belt somebody already holds, so it cannot predate
  // it. Getting this pair backwards is the mistake the form exists to fix, and
  // saving it the wrong way round would leave "time at this belt" longer than
  // the member has been training.
  if (stripeSince < rankSince) {
    detail({ error: t.msg.stripeBeforeBelt });
    return;
  }

  const { error } = await supabase.rpc("correct_rank_dates", {
    p_person_id: personId,
    p_rank_since: rankSince,
    p_stripe_since: stripeSince,
  });

  if (error) {
    logDbError("members", "correctRankDates", error);
    detail({ error: t.msg.datesFailed });
    return;
  }

  revalidatePath(`/members/${personId}`);
  // Both dates feed promotionStatus(), so the Registro's eligibility count, its
  // `idonei` filter and the green dot all change with them.
  revalidatePath(PATH);
  detail({ ok: t.msg.datesSaved });
}

// Corrects the date a member joined the gym.
//
// Separate from correctRankDates because it answers a different question: not
// "when did they get this belt" but "since when do they train here". It feeds
// the estimated opening hours and the time-in-training figure, and through them
// eligibility. Unlike the belt dates it has no order against them — a belt
// earned at another academy predates the day somebody joined this one.
//
// A registry editor only, and never on their own row: guard_person_auth_link
// refuses both (and an edit of anybody else's by a non-editor), so
// requireRegistryEditor is the early, clear refusal and the trigger and RLS are
// the boundary — this runs on the user's own client, not the service-role one.
export async function correctJoinedDate(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const personId = text(formData, "person_id");
  const joinedAt = text(formData, "joined_at");
  const detail = detailRedirect(personId, formData);

  if (!personId || !joinedAt || !/^\d{4}-\d{2}-\d{2}$/.test(joinedAt)) {
    detail({ error: t.msg.joinedFailed });
    return;
  }

  // Against the gym's own "today": the input's `max` does not bind a crafted
  // POST. ISO strings sort chronologically.
  const today = todayIn((await requireGymSettings()).timezone);
  if (joinedAt > today) {
    detail({ error: t.msg.dateInFuture });
    return;
  }

  // `.select()` so a row RLS hides from this client reads as a failure rather
  // than a silent zero-row update reported as saved.
  const { data, error } = await supabase
    .from("person")
    .update({ joined_at: joinedAt })
    .eq("id", personId)
    .select("id");

  if (error || !data || data.length === 0) {
    if (error) logDbError("members", "correctJoinedDate", error);
    detail({ error: t.msg.joinedFailed });
    return;
  }

  revalidatePath(`/members/${personId}`);
  // The Registro lists the join date, the time in training and the estimate.
  revalidatePath(PATH);
  detail({ ok: t.msg.joinedSaved });
}

// The roles a member can be moved between from their record. `admin` is not
// one: it is a portal-manager grant made where the account is created, and a
// member switched to it alone would turn portal-only and drop out of every list.
const TEACHING_ROLES = ["student", "assistant", "instructor", "head_coach"] as const;

// Moves a member to another teaching role: the open ones are closed today and
// the new one opens today, so the history keeps both. An open `admin` is left
// alone. Approval of an invite registration always makes a student; this is how
// a maestro or instructor who signed up gets their real role.
//
// User managers only, on the user's own client: RLS lets only them write
// assigned_role. Never on their own record — nobody grants or drops their own
// privileges. That also guarantees the gym keeps a manager: the caller is one
// and is not the person being changed.
export async function changeRole(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase, userId } = await requireUserManager(PATH);

  const personId = text(formData, "person_id");
  const role = formData.get("role") as string;
  const detail = detailRedirect(personId, formData);

  if (!personId || !TEACHING_ROLES.includes(role as (typeof TEACHING_ROLES)[number])) {
    detail({ error: t.msg.roleFailed });
    return;
  }

  const { data: person } = await supabase
    .from("person")
    .select("auth_user_id")
    .eq("id", personId)
    .maybeSingle();

  if (!person || person.auth_user_id === userId) {
    detail({ error: t.msg.roleFailed });
    return;
  }

  // Already the only teaching role: nothing to close or open.
  const { data: open } = await supabase
    .from("assigned_role")
    .select("role")
    .eq("person_id", personId)
    .is("end_date", null)
    .neq("role", PORTAL_ONLY_ROLE);
  const current = (open ?? []).map((r) => r.role as string);
  if (current.length === 1 && current[0] === role) {
    detail({ ok: t.msg.roleChanged(roleLabel(role, t)) });
    return;
  }

  // The gym's today, as for every other date written from the Registro.
  const today = todayIn((await requireGymSettings()).timezone);
  const { error: closeError } = await supabase
    .from("assigned_role")
    .update({ end_date: today })
    .eq("person_id", personId)
    .is("end_date", null)
    .neq("role", PORTAL_ONLY_ROLE);

  if (closeError) {
    logDbError("members", "changeRole:close", closeError);
    detail({ error: t.msg.roleFailed });
    return;
  }

  const { error: openError } = await supabase
    .from("assigned_role")
    .insert({ person_id: personId, role, start_date: today });

  if (openError) {
    // ponytail: two writes without a transaction; a failed insert leaves the
    // member with no teaching role (= student) until the change is repeated.
    logDbError("members", "changeRole:open", openError);
    detail({ error: t.msg.roleFailed });
    return;
  }

  revalidatePath(`/members/${personId}`);
  // The Registro lists active roles and filters by them.
  revalidatePath(PATH);
  detail({ ok: t.msg.roleChanged(roleLabel(role, t)) });
}

// Tunes one row of promotion_criteria. The grade itself is never editable:
// the ladder is fixed, only its numbers are the gym's business — so belt and
// stripe arrive as hidden fields and are used to address the row, never to
// create one.
//
// It lives here, next to the Registro's other actions, because the criteria
// editor belongs to the Registro even though it now has its own route: same
// privilege, same guard, same file.
//
// It redirects back to /members/criteria rather than to the list, because that
// is the page the form is on — sixty rows of thresholds are edited a few at a
// time, and being thrown back to the member list after each save would be
// absurd. `_from` carries the Registro's own filters through untouched, so the
// back link on that page still leads to the list you came from.
export async function updateCriterion(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(CRITERIA_PATH);

  const from = (formData.get("_from") as string | null) ?? "";

  const belt = text(formData, "belt");
  const stripe = number(formData, "stripe");
  if (!belt || stripe === null) {
    backToCriteria({ error: t.msg.criterionFailed }, from);
    return;
  }

  const minHours = number(formData, "min_hours");
  const minDays = number(formData, "min_time_at_rank_days");
  if (minHours === null || minHours < 0 || minDays === null || minDays < 0) {
    backToCriteria({ error: t.msg.criterionFailed }, from);
    return;
  }

  const minAge = number(formData, "min_age_years");

  const { error } = await supabase
    .from("promotion_criteria")
    .update({
      min_hours: minHours,
      min_time_at_rank_days: Math.round(minDays),
      min_age_years: minAge === null ? null : Math.round(minAge),
      notes: text(formData, "notes"),
    })
    .eq("belt", belt)
    .eq("stripe", stripe);

  if (error) {
    // The database's own text never reaches the screen: codes and constraint
    // names describe the schema, which is not the reader's business.
    console.error(
      `[members] updateCriterion failed: ${error.code ?? "no code"} ${error.message ?? ""}`.trim(),
    );
    backToCriteria({ error: t.msg.criterionFailed }, from);
    return;
  }

  // Both paths: the thresholds are edited here, and the Registro's count, dot
  // and `idonei` filter are computed from them, so a saved criterion changes
  // the list as much as it changes this page.
  revalidatePath(CRITERIA_PATH);
  revalidatePath(PATH);
  backToCriteria({ ok: t.msg.criterionSaved }, from);
}
