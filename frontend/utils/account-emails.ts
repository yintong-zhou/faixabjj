import "server-only";

import type { User } from "@supabase/supabase-js";
import { linkSecret, signLink } from "@/utils/auth-link-token";
import type { Locale } from "@/utils/i18n/locales";
import { logDbError } from "@/utils/log";
import { deliver } from "@/utils/notify-flow";
import { SITE_URL } from "@/utils/site";
import { accountName, createAdminClient, findAuthUserByEmail } from "@/utils/supabase/admin";

// Every email the app sends, one function per event. Each is meant to run
// inside after(): it never throws and never delays the action that asked for
// it. Links go to SITE_URL, never to the request's Host or Origin header,
// which whoever sends the request can write.

function fail(where: string, error: unknown) {
  logDbError("notify", where, {
    code: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : null,
  });
}

function secretOrLog(where: string): string | null {
  const secret = linkSecret();
  // Not caused by whoever asked: a deployment that lost its secret sends no
  // reset and no confirmation, which the log has to show.
  if (!secret) {
    logDbError("notify", where, { code: "link_secret_missing", message: "AUTH_LINK_SECRET is missing or shorter than 32 characters" });
  }
  return secret;
}

/** /forgot-password. Silent when the address has no account. */
export async function sendResetLink(email: string, locale: Locale) {
  const secret = secretOrLog("password-reset");
  if (!secret) return;
  try {
    const user = await findAuthUserByEmail(email);
    if (!user?.email) return;

    // Bound to updated_at, which the password change moves: single use.
    const now = Date.now();
    const token = signLink({ k: "reset", u: user.id, b: user.updated_at ?? "" }, secret, now);
    await deliver({
      template: "password-reset",
      to: user.email,
      locale,
      variables: {
        name: await accountName(user),
        resetUrl: `${SITE_URL}/reset-password?token=${token}`,
      },
      // A second request is a second link, so a second email.
      idempotencyKey: `reset:${user.id}:${now}`,
      accountId: user.id,
    });
  } catch (error) {
    fail("password-reset", error);
  }
}

/** After any password change made by the account's owner. */
export async function sendPasswordChanged(userId: string, locale: Locale) {
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    if (!data.user?.email) return;
    await deliver({
      template: "password-changed",
      to: data.user.email,
      locale,
      variables: { name: await accountName(data.user) },
      idempotencyKey: `pwchanged:${userId}:${Date.now()}`,
      accountId: userId,
    });
  } catch (error) {
    fail("password-changed", error);
  }
}

/** /account: the confirmation link, sent to the new address. */
export async function sendEmailChangeLink(userId: string, newEmail: string, locale: Locale) {
  const secret = secretOrLog("email-change");
  if (!secret) return;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    const user = data.user;
    if (!user?.email) return;

    // Bound to the current address, which the change replaces: single use.
    const now = Date.now();
    const token = signLink({ k: "email", u: user.id, b: user.email, e: newEmail }, secret, now);
    await deliver({
      template: "email-change",
      to: newEmail,
      locale,
      variables: {
        name: await accountName(user),
        confirmUrl: `${SITE_URL}/confirm-email?token=${token}`,
      },
      idempotencyKey: `emailchange:${user.id}:${now}`,
      accountId: user.id,
    });
  } catch (error) {
    fail("email-change", error);
  }
}

/** /confirm-email: the notice to the address that was just replaced. */
export async function sendEmailChanged(
  user: User,
  oldEmail: string,
  linkExpiry: number,
  locale: Locale,
) {
  try {
    await deliver({
      template: "email-changed",
      to: oldEmail,
      locale,
      variables: { name: await accountName(user), newEmail: user.email ?? "" },
      // One link, one change, one notice.
      idempotencyKey: `emailchanged:${user.id}:${linkExpiry}`,
      accountId: user.id,
    });
  } catch (error) {
    fail("email-changed", error);
  }
}
