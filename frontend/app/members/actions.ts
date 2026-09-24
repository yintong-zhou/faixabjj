"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, MissingSecretKeyError } from "@/utils/supabase/admin";
import {
  requireRegistryEditor,
  requireUserManager,
} from "@/utils/supabase/require-admin";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import { getDictionary } from "@/utils/i18n/server";
import { PORTAL_ONLY_ROLE } from "@/utils/members";
import { BELT_ORDER } from "@/utils/supabase/profile";

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

async function origin() {
  const headersList = await headers();
  return headersList.get("origin") ?? `https://${headersList.get("host")}`;
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
async function personInMyGym(
  supabase: SupabaseClient,
  filter: { authUserId: string } | { personId: string },
): Promise<{ id: string; auth_user_id: string | null } | null> {
  const query = supabase.from("person").select("id, auth_user_id");
  const { data } = await ("authUserId" in filter
    ? query.eq("auth_user_id", filter.authUserId)
    : query.eq("id", filter.personId)
  ).maybeSingle();
  return (data as { id: string; auth_user_id: string | null } | null) ?? null;
}

// Adds a member to the registry *and* creates their login account in one act.
//
// The account is created with the shared default password, its address marked
// confirmed so no email is sent and nothing has to be clicked, and
// `must_change_password` set — which the proxy and requireAdmin enforce, so the
// member replaces the shared password before anything else in the app opens.
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

  // The new account belongs to the caller's gym, named in app_metadata where
  // the member cannot change it; the auth trigger creates the person row there.
  const { data: gymId } = await supabase.rpc("current_gym_id");
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

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
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
  const { data: person, error } = await supabase
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
    .select("id")
    .maybeSingle();

  if (error || !person) {
    back(
      {
        error: t.msg.accountCreatedNoProfile(email),
      },
      query,
    );
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
      ok: t.msg.personAdded(fullName, DEFAULT_PASSWORD),
    },
    query,
  );
}

// Grants portal access to someone in the registry who has none — in practice
// a member whose access was revoked, since addPerson now creates the account
// up front. Unlike addPerson this *does* send an email and lets the person pick
// their own password, so no default password and no forced change are involved.
// The trigger in 20260911160000 links the new auth user back to this person by
// email instead of creating a duplicate row.
export async function inviteToPortal(formData: FormData) {
  const { t } = await getDictionary();
  // The admin client below uses the secret key, which bypasses Row Level
  // Security entirely, so the database will not enforce the privilege here.
  const { supabase } = await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const email = (formData.get("email") as string | null)?.trim();
  const fullName = (formData.get("full_name") as string | null)?.trim();
  const personId = (formData.get("person_id") as string | null) ?? "";

  if (!email) {
    back(
      { error: t.msg.emailNeededToInvite },
      query,
    );
    return;
  }

  const target = personId ? await personInMyGym(supabase, { personId }) : null;
  const { data: gymId } = await supabase.rpc("current_gym_id");
  if (!target || target.auth_user_id || !gymId) {
    back({ error: t.msg.userNotInGym }, query);
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
            ? t.msg.secretMissingInvite
            : t.msg.adminClientMissing,
      },
      query,
    );
    return;
  }

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName ?? "" },
    redirectTo: `${await origin()}/reset-password`,
  });

  if (error || !invited?.user) {
    back({ error: t.msg.inviteFailed }, query);
    return;
  }

  // inviteUserByEmail cannot set app_metadata, so the auth trigger saw no gym
  // and made no profile. The link is made here instead: the gym goes into
  // app_metadata, and the registry row the maestro already has is pointed at
  // the new account — only if it is still account-less, only in this gym.
  const { error: metaError } = await admin.auth.admin.updateUserById(invited.user.id, {
    app_metadata: { gym_id: gymId },
  });
  const { error: linkError } = await admin
    .from("person")
    .update({ auth_user_id: invited.user.id })
    .eq("id", target.id)
    .eq("gym_id", gymId as string)
    .is("auth_user_id", null);

  if (metaError || linkError) {
    console.error(
      `[members] inviteToPortal link failed: ${metaError?.code ?? ""} ${linkError?.code ?? ""}`.trim(),
    );
    back({ error: t.msg.inviteFailed }, query);
    return;
  }

  revalidatePath(PATH);
  back({ ok: t.msg.inviteSent(email) }, query);
}

// Resets a member's password to the shared default, rather than emailing a
// recovery link — the same password addPerson starts every account on, so the
// maestro has nothing to read off the screen and pass on. It is provisional by
// construction: setting it re-arms must_change_password, so the member has to
// replace it at their next login exactly like a freshly created account.
// Without that flag this would leave an account on a password everyone knows.
export async function setTemporaryPassword(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const targetId = formData.get("user_id") as string;

  if (!targetId) {
    back({ error: t.msg.userNotSpecified }, query);
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
      { error: t.msg.secretMissingReset },
      query,
    );
    return;
  }

  const { data, error } = await admin.auth.admin.updateUserById(targetId, {
    password: DEFAULT_PASSWORD,
    app_metadata: { must_change_password: true },
  });

  if (error || !data?.user) {
    back({ error: t.msg.resetFailed }, query);
    return;
  }

  back(
    {
      ok: t.msg.passwordReset(data.user.email ?? t.msg.someUser, DEFAULT_PASSWORD),
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

// Recording a promotion is one RPC, not two writes: updating the person row
// and inserting the history row have to happen together, and record_promotion()
// does both in one transaction. The function is security *invoker*, so RLS and
// the guard trigger still apply — requireRegistryEditor here is the early, clear
// refusal, not the security boundary.
export async function recordPromotion(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

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
    console.error(
      `[members] recordPromotion failed: ${error.code ?? "no code"} ${error.message ?? ""}`.trim(),
    );
    redirect(`/members/${personId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/members/${personId}`);
  // The Registro carries the eligibility count and the `idonei` filter, so a
  // promotion changes what that list shows.
  revalidatePath(PATH);
  redirect(`/members/${personId}?ok=${encodeURIComponent(t.msg.promotionRecorded)}`);
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
// Both dates are frozen by guard_person_auth_link against anybody who is not a
// registry editor, which is what keeps promotion out of self-service: backdating
// `rank_since` is the cleanest way to fake eligibility. The trigger already
// allowed an editor through — what was missing was anywhere to do it from, so
// after creation the two dates could only be moved by recording a promotion
// that never happened. requireRegistryEditor here is the early, clear refusal;
// the trigger and RLS are the boundary, since this runs on the user's own
// client and not the service-role one.
export async function correctRankDates(formData: FormData) {
  const { t } = await getDictionary();
  const { supabase } = await requireRegistryEditor(PATH);

  const personId = text(formData, "person_id");
  const fromQuery = (formData.get("_from") as string | null) ?? "";

  const detail = (params: Record<string, string>) => {
    const search = new URLSearchParams();
    if (fromQuery) search.set("from", fromQuery);
    for (const [key, value] of Object.entries(params)) search.set(key, value);
    redirect(`/members/${personId ?? ""}?${search.toString()}`);
  };

  const rankSince = text(formData, "rank_since");
  const stripeSince = text(formData, "stripe_since");

  if (!personId || !rankSince || !stripeSince) {
    detail({ error: t.msg.datesFailed });
    return;
  }

  // Compared as ISO strings, which sort chronologically, and against the gym's
  // own "today" rather than the browser's — the date arrives as text and a
  // crafted POST is not bound by the input's `max`.
  const today = new Date(Date.now()).toISOString().slice(0, 10);
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

  const { error } = await supabase
    .from("person")
    .update({ rank_since: rankSince, stripe_since: stripeSince })
    .eq("id", personId);

  if (error) {
    console.error(
      `[members] correctRankDates failed: ${error.code ?? "no code"} ${error.message ?? ""}`.trim(),
    );
    detail({ error: t.msg.datesFailed });
    return;
  }

  revalidatePath(`/members/${personId}`);
  // Both dates feed promotionStatus(), so the Registro's eligibility count, its
  // `idonei` filter and the green dot all change with them.
  revalidatePath(PATH);
  detail({ ok: t.msg.datesSaved });
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
