"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient, MissingSecretKeyError } from "@/utils/supabase/admin";
import {
  requireRegistryEditor,
  requireUserManager,
} from "@/utils/supabase/require-admin";
import { DEFAULT_PASSWORD } from "@/utils/default-password";
import { getDictionary } from "@/utils/i18n/server";

const PATH = "/members";

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

const BELTS = ["white", "blue", "purple", "brown", "black"] as const;

const text = (formData: FormData, key: string) => {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : null;
};

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

  const belt = formData.get("current_belt") as string;
  if (!BELTS.includes(belt as (typeof BELTS)[number])) {
    back({ error: t.msg.pickBelt }, query);
    return;
  }

  const stripes = Number.parseInt((formData.get("current_stripes") as string) ?? "0", 10);
  if (!Number.isInteger(stripes) || stripes < 0 || stripes > 4) {
    back({ error: t.msg.stripesRange }, query);
    return;
  }

  const role = formData.get("role") as string;
  if (!ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    back({ error: t.msg.pickRole }, query);
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
    app_metadata: { must_change_password: true },
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
      ...(text(formData, "rank_since") ? { rank_since: text(formData, "rank_since") } : {}),
      ...(text(formData, "stripe_since")
        ? { stripe_since: text(formData, "stripe_since") }
        : {}),
      current_belt: belt,
      current_stripes: stripes,
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
  await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const email = (formData.get("email") as string | null)?.trim();
  const fullName = (formData.get("full_name") as string | null)?.trim();

  if (!email) {
    back(
      { error: t.msg.emailNeededToInvite },
      query,
    );
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

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName ?? "" },
    redirectTo: `${await origin()}/reset-password`,
  });

  if (error) {
    back(
      { error: t.msg.inviteFailed },
      query,
    );
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
  await requireUserManager(PATH);

  const query = (formData.get("_query") as string | null) ?? "";
  const targetId = formData.get("user_id") as string;

  if (!targetId) {
    back({ error: t.msg.userNotSpecified }, query);
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
  const { userId: currentUserId } = await requireUserManager(PATH);

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
