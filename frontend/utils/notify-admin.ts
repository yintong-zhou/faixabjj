import "server-only";

import type { Locale } from "@/utils/i18n/locales";
import { NotifyError, notifyConfig } from "@/utils/notify-flow";

// The /email page's side of notify-flow's /v1 API: templates (list, read,
// write, delete), a test send and a status read. Same key, same env and the
// same NotifyError as utils/notify-flow.ts, which stays the only way real
// emails go out.
//
// Every call spends the client's request budget, shared with real emails
// (60/minute): the page makes one list call per load and never polls.

const TIMEOUT_MS = 30_000;

export type TemplateSummary = {
  name: string;
  locale: string;
  updatedAt: string | null;
  builtin: boolean;
};

export type TemplateContent = {
  subject: string;
  html: string;
  text: string;
  variables: string[];
  builtin: boolean;
};

type Body = Record<string, unknown> | unknown[] | null;

async function call(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Body }> {
  const config = notifyConfig();
  if (!config) throw new NotifyError(0, "not_configured");

  let response: Response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.key}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new NotifyError(0, timedOut ? "timeout" : "network_error");
  }

  const body = response.status === 204 ? null : ((await response.json().catch(() => null)) as Body);
  return { status: response.status, body };
}

function failure(status: number, body: Body): NotifyError {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return new NotifyError(status, typeof code === "string" ? code : "unexpected_response");
}

const ok = (status: number) => status >= 200 && status < 300;

/** Whether notify-flow answers at all. No key is sent; never throws. */
export async function checkHealth(): Promise<boolean> {
  const config = notifyConfig();
  const url = config?.url ?? process.env.NOTIFY_FLOW_URL?.replace(/\/$/, "");
  if (!url) return false;
  try {
    const response = await fetch(`${url}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Our templates plus the built-ins we haven't overridden. */
export async function listTemplates(): Promise<TemplateSummary[]> {
  const { status, body } = await call("GET", "/v1/templates");
  if (!ok(status) || !Array.isArray(body)) throw failure(status, ok(status) ? null : body);
  return body.map((row) => {
    const t = row as { name: string; locale: string; updated_at: number | null; builtin: boolean };
    return {
      name: t.name,
      locale: t.locale,
      // notify-flow keeps unix seconds.
      updatedAt: typeof t.updated_at === "number" ? new Date(t.updated_at * 1000).toISOString() : null,
      builtin: t.builtin === true,
    };
  });
}

const templatePath = (name: string, locale: Locale) =>
  `/v1/templates/${encodeURIComponent(name)}/${encodeURIComponent(locale)}`;

/** Ours if we have one, else notify-flow's built-in; null when neither exists. */
export async function getTemplate(name: string, locale: Locale): Promise<TemplateContent | null> {
  const { status, body } = await call("GET", templatePath(name, locale));
  if (status === 404) return null;
  if (!ok(status)) throw failure(status, body);
  const t = body as TemplateContent;
  return {
    subject: t.subject,
    html: t.html,
    text: t.text,
    variables: Array.isArray(t.variables) ? t.variables : [],
    builtin: t.builtin === true,
  };
}

export async function putTemplate(
  name: string,
  locale: Locale,
  template: Omit<TemplateContent, "builtin">,
): Promise<void> {
  const { subject, html, text, variables } = template;
  const { status, body } = await call("PUT", templatePath(name, locale), {
    body: { subject, html, text, variables },
  });
  if (!ok(status)) throw failure(status, body);
}

/** Removes our row; for a built-in name that restores notify-flow's text. */
export async function deleteTemplate(name: string, locale: Locale): Promise<void> {
  const { status, body } = await call("DELETE", templatePath(name, locale));
  if (status === 404) throw new NotifyError(404, "not_found");
  if (!ok(status)) throw failure(status, body);
}

/**
 * Sends one email now (no `Prefer: respond-async`), so the answer already
 * says whether SMTP took it. A refused SMTP send still has an id: it comes
 * back as `failed`, not as an error.
 */
export async function sendTest(email: {
  template: string;
  to: string;
  locale: Locale;
  variables: Record<string, string>;
}): Promise<{ id: string; status: string }> {
  const { status, body } = await call("POST", "/v1/email/send", {
    body: email,
    headers: { "Idempotency-Key": `test:${crypto.randomUUID()}` },
  });
  const reply = body as { id?: unknown; status?: unknown } | null;
  if (ok(status) && typeof reply?.id === "string") {
    return { id: reply.id, status: typeof reply.status === "string" ? reply.status : "submitted" };
  }
  if (status === 502 && typeof reply?.id === "string") return { id: reply.id, status: "failed" };
  if (status === 429) throw new NotifyError(429, "rate_limited");
  throw failure(status, body);
}

export async function emailStatus(id: string): Promise<{ status: string; errorCode: string | null }> {
  const { status, body } = await call("GET", `/v1/email/${encodeURIComponent(id)}`);
  if (!ok(status)) throw failure(status, body);
  const reply = body as { status?: unknown; error_code?: unknown } | null;
  return {
    status: typeof reply?.status === "string" ? reply.status : "unknown",
    errorCode: typeof reply?.error_code === "string" ? reply.error_code : null,
  };
}
