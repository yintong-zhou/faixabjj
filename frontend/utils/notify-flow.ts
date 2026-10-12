import "server-only";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/utils/i18n/locales";
import { logDbError } from "@/utils/log";

// The app's only way to send email: notify-flow, a Cloudflare Worker that
// delivers over SMTP. Supabase sends nothing — every link (reset, email
// change) is made and checked by this app (utils/auth-link-token.ts) and only
// the finished link travels.
//
// Backend only: the key below must never reach the browser, hence the missing
// NEXT_PUBLIC_ prefix and the server-only import.
//
// Asynchronous (`Prefer: respond-async`): the service queues the message and
// answers at once with 202 "queued", then makes up to 5 SMTP attempts over
// about 50 minutes. So a returned id means "accepted for delivery", not
// "delivered": the outcome is read later with GET /v1/email/{id}, and a final
// failure never reaches this app's logs.
//
// Never log what is sent. The variables carry links with live tokens and the
// key opens the service: the log gets the template, the returned id and the
// error code, nothing else.

export type EmailTemplate =
  | "welcome"
  | "password-reset"
  | "password-changed"
  | "email-change"
  | "email-changed";

export type Email = {
  template: EmailTemplate;
  to: string;
  // Exactly the variables the template declares, appName excepted: it is
  // added here. Strings only.
  variables: Record<string, string>;
  locale: Locale;
  // Unique per user action and stable across retries: built from ids, never
  // from a random value made at send time.
  idempotencyKey: string;
};

export class NotifyError extends Error {
  // status 0 = no HTTP answer (timeout, network, not configured).
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`notify-flow ${status} ${code}`);
    this.name = "NotifyError";
  }
}

// Async answers as soon as the message is queued, but the contract still asks
// for at least 30 s.
const TIMEOUT_MS = 30_000;

// What a queued send (202) or a replay of one (200/202) may report. A replay
// of a send that already ended in `failed` also answers 200/202, so the
// status is read, not just the HTTP code.
const ACCEPTED = new Set(["queued", "processing", "retrying", "submitted"]);

/** The language a template is sent in: one of ours, English otherwise. */
export function notifyLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Queues one email and returns notify-flow's message id; throws NotifyError. */
export async function sendEmail(email: Email): Promise<string> {
  const url = process.env.NOTIFY_FLOW_URL?.replace(/\/$/, "");
  const key = process.env.NOTIFY_FLOW_API_KEY;
  const appName = process.env.NOTIFY_FLOW_APP_NAME;
  if (!url || !key || !appName) throw new NotifyError(0, "not_configured");

  const init = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
      Prefer: "respond-async",
    },
    body: JSON.stringify({
      template: email.template,
      to: email.to,
      locale: email.locale,
      variables: { ...email.variables, appName },
    }),
  };

  // One retry, with the same Idempotency-Key, only where the message may never
  // have reached the queue: a timeout, a network failure, a 500 or a 503
  // `queue_unavailable`. Not `smtp_misconfigured` (a 500 that only the
  // administrator can fix), not a 429 (it wants a full minute), not 4xx (bugs
  // or configuration). The user asking again is the retry.
  try {
    return await post(`${url}/v1/email/send`, init);
  } catch (error) {
    if (!(error instanceof NotifyError) || !retryable(error)) throw error;
    return await post(`${url}/v1/email/send`, init);
  }
}

const retryable = ({ status, code }: NotifyError) =>
  status === 0 || status === 503 || (status === 500 && code !== "smtp_misconfigured");

async function post(url: string, init: RequestInit): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new NotifyError(0, timedOut ? "timeout" : "network_error");
  }

  const body = (await response.json().catch(() => null)) as {
    id?: unknown;
    status?: unknown;
    error?: { code?: unknown };
  } | null;
  if (response.ok) {
    const status = typeof body?.status === "string" ? body.status : "unexpected_response";
    if (typeof body?.id === "string" && ACCEPTED.has(status)) return body.id;
    // A replayed key whose send had already failed: `failed` as the code.
    throw new NotifyError(response.status, status);
  }
  const code = typeof body?.error?.code === "string" ? body.error.code : "unexpected_response";
  throw new NotifyError(response.status, code);
}

/**
 * Sends and never throws: a failed email must not fail the action that asked
 * for it. Call it inside after(), so the reader is not kept waiting either.
 */
export async function deliver(email: Email): Promise<void> {
  try {
    const id = await sendEmail(email);
    console.info(`[notify] ${email.template} ${id} accepted`);
  } catch (error) {
    const { status, code } =
      error instanceof NotifyError ? error : { status: 0, code: "unexpected_error" };
    logDbError("notify", email.template, { code: `${status} ${code}` });
  }
}
