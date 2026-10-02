"use server";

import { redirect } from "next/navigation";

import { todayIn } from "@/utils/dates";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError } from "@/utils/log";
import { parseRegistration } from "@/utils/registration";
import { createAdminClient } from "@/utils/supabase/admin";
import { gymForInvite } from "@/utils/supabase/invite";
import { turnstileToken } from "@/utils/turnstile";
import { verifyTurnstile } from "@/utils/turnstile-verify";
import { isValidUsername, normalizeUsername } from "@/utils/username";

export type JoinState = { error: string | null; values: Record<string, string>; attempt: number };
export type UsernameStatus = "available" | "taken" | "invalid" | "error";

// Sent back on an error so the form is refilled (React resets a form after its
// action runs). Never the passwords.
const KEPT = [
  "full_name", "email", "username", "birth_date", "joined_at", "experienced",
  "current_belt", "current_stripes", "rank_since", "stripe_since",
] as const;

// Self-registration through a gym's invite link. Creates the account at once —
// the athlete's own password, no email, address marked confirmed — with the gym
// in app_metadata.pending_gym_id and NOT in gym_id, so the auth trigger creates
// no profile and the account sees nothing until a user manager approves it
// (app/members/requests/actions.ts).
//
// Account first, then the request: createUser is the step that fails on a
// taken email. If the request cannot be written, the account is deleted again.
export async function register(token: string, prev: JoinState, formData: FormData): Promise<JoinState> {
  const { t } = await getDictionary();
  const values = Object.fromEntries(KEPT.map((key) => [key, String(formData.get(key) ?? "")]));
  const fail = (error: string): JoinState => ({ error, values, attempt: prev.attempt + 1 });

  if (!(await verifyTurnstile(turnstileToken(formData)))) return fail(t.join.errors.captchaFailed);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return fail(t.join.errors.failed);
  }

  // Re-read: the link may have been regenerated since the page was opened.
  const gymId = await gymForInvite(admin, token);
  if (!gymId) return fail(t.join.errors.linkExpired);

  const { data: gym, error: gymError } = await admin.from("gym").select("timezone").eq("id", gymId).single();
  if (gymError || !gym) {
    if (gymError) logDbError("join", "register:gym", gymError);
    return fail(t.join.errors.failed);
  }

  const parsed = parseRegistration(
    (key) => formData.get(key) as string | null,
    todayIn((gym as { timezone: string }).timezone),
    "signup",
  );
  if (!parsed.ok) return fail(t.join.errors[parsed.error]);
  const r = parsed.value;

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: r.email,
    password: r.password as string,
    email_confirm: true,
    user_metadata: { full_name: r.fullName },
    app_metadata: { pending_gym_id: gymId },
  });
  if (authError || !created?.user) {
    logDbError("join", "register:createUser", {
      code: authError?.code ?? "no-user",
      message: authError?.message ?? "no user returned",
    });
    // A taken email gets the generic message: saying so would tell anyone with
    // the link who has an account. A weak password reveals nothing.
    return fail(authError?.code === "weak_password" ? t.join.errors.passwordWeak : t.join.errors.failed);
  }

  const { error: insertError } = await admin.from("registration_request").insert({
    gym_id: gymId,
    auth_user_id: created.user.id,
    full_name: r.fullName,
    email: r.email,
    username: r.username,
    birth_date: r.birthDate,
    joined_at: r.joinedAt,
    current_belt: r.belt,
    current_stripes: r.stripes,
    rank_since: r.rankSince,
    stripe_since: r.stripeSince,
  });
  if (insertError) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(created.user.id);
    if (deleteError) {
      logDbError("join", "register:rollback", { code: deleteError.code ?? null, message: deleteError.message });
    }
    // 23505 here is the username: taken between the live check and submit.
    if (insertError.code === "23505") return fail(t.join.errors.usernameTaken);
    logDbError("join", "register:insert", insertError);
    return fail(t.join.errors.failed);
  }

  redirect("/login?registered=1");
}

// The form's live check. Answers only for a valid link — never a public
// "does this username exist" endpoint. Accepted trade-off (spec): the login
// hides whether a username exists, this reveals it to whoever holds the link.
export async function checkUsername(token: string, raw: string): Promise<UsernameStatus> {
  const username = normalizeUsername(raw);
  if (!isValidUsername(username)) return "invalid";

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return "error";
  }
  if (!(await gymForInvite(admin, token))) return "error";

  const { data, error } = await admin.rpc("username_available", { p_username: username });
  if (error) {
    logDbError("join", "username_available", error);
    return "error";
  }
  return data === true ? "available" : "taken";
}
