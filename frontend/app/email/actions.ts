"use server";

import { redirect } from "next/navigation";

import {
  APP_TEMPLATES,
  declaredVariables,
  isAppTemplate,
  isTemplateName,
  sampleValues,
  unknownPlaceholders,
} from "@/utils/email-templates";
import { isLocale, type Locale } from "@/utils/i18n/locales";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError, logEvent, logOutcome } from "@/utils/log";
import { deleteTemplate, emailStatus, getTemplate, putTemplate, sendTest } from "@/utils/notify-admin";
import { NotifyError, notifyConfig } from "@/utils/notify-flow";
import { SITE_NAME, SITE_URL } from "@/utils/site";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";

// notify-flow's limits, checked here first so a refusal says which field.
const SUBJECT_MAX = 255;
const HTML_MAX_BYTES = 100_000;
const TEXT_MAX_BYTES = 50_000;

const bytes = (value: string) => new TextEncoder().encode(value).length;

function editor(name: string, locale: Locale, params: Record<string, string> = {}): never {
  const query = new URLSearchParams(params).toString();
  redirect(`/email/${name}/${locale}${query ? `?${query}` : ""}`);
}

// Name and locale come from the form, so from anyone: checked before they go
// anywhere near a URL. Anything else is a 404, like the page.
function target(formData: FormData): { name: string; locale: Locale } {
  const name = String(formData.get("name") ?? "");
  const locale = String(formData.get("locale") ?? "");
  if (!isTemplateName(name) || !isLocale(locale)) redirect("/email");
  return { name, locale };
}

function logNotify(where: string, error: unknown) {
  const { status, code } = error instanceof NotifyError ? error : { status: 0, code: "unexpected_error" };
  logDbError("email", where, { code: `${status} ${code}` });
  return status;
}

export async function saveTemplate(formData: FormData) {
  const session = await requirePlatformAdmin("/email");
  const { t } = await getDictionary();
  const errors = t.emailAdmin.errors;
  const { name, locale } = target(formData);

  // Line endings as typed in a textarea arrive as CRLF; notify-flow wants a
  // subject on one line and keeps the rest as given.
  const subject = String(formData.get("subject") ?? "").trim();
  const html = String(formData.get("html") ?? "");
  const text = String(formData.get("text") ?? "");
  const isNew: Record<string, string> = formData.get("new") === "1" ? { new: "1" } : {};

  if (!subject || subject.length > SUBJECT_MAX || /[\r\n]/.test(subject)) {
    editor(name, locale, { ...isNew, error: errors.subjectInvalid });
  }
  if (!html.trim() || bytes(html) > HTML_MAX_BYTES) editor(name, locale, { ...isNew, error: errors.htmlInvalid });
  if (!text.trim() || bytes(text) > TEXT_MAX_BYTES) editor(name, locale, { ...isNew, error: errors.textInvalid });

  // The contract: an email the app sends may use only the variables its code
  // passes, or every real send of it would be refused.
  if (isAppTemplate(name)) {
    const unknown = unknownPlaceholders([subject, html, text], APP_TEMPLATES[name].variables);
    if (unknown.length > 0) {
      editor(name, locale, { ...isNew, error: errors.unknownPlaceholders(unknown.join(", ")) });
    }
  }

  try {
    await putTemplate(name, locale, {
      subject,
      html,
      text,
      variables: declaredVariables(name, [subject, html, text]),
    });
  } catch (error) {
    const status = logNotify("saveTemplate", error);
    editor(name, locale, {
      ...isNew,
      error: status >= 400 && status < 500 && status !== 401 && status !== 429 ? errors.saveRejected : errors.unavailable,
    });
  }

  logEvent({ userId: session.userId, gymId: null }, "email", `save:${name}:${locale}`);
  editor(name, locale, { ok: t.emailAdmin.editor.saved });
}

// "Restore default" over a built-in, "Delete" for a template of ours alone.
// Never for an email the app sends that has no built-in behind it: deleting
// it would make every one of those sends fail.
export async function removeTemplate(formData: FormData) {
  const session = await requirePlatformAdmin("/email");
  const { t } = await getDictionary();
  const { name, locale } = target(formData);

  if (isAppTemplate(name) && !APP_TEMPLATES[name].builtin) {
    editor(name, locale, { error: t.emailAdmin.errors.deleteAppTemplate });
  }

  try {
    await deleteTemplate(name, locale);
  } catch (error) {
    if (error instanceof NotifyError && error.status === 404) {
      editor(name, locale, { error: t.emailAdmin.errors.nothingToRemove });
    }
    logNotify("removeTemplate", error);
    editor(name, locale, { error: t.emailAdmin.errors.unavailable });
  }

  logEvent({ userId: session.userId, gymId: null }, "email", `delete:${name}:${locale}`);

  // A built-in came back: stay on it. Nothing left: back to the list.
  let restored = false;
  try {
    restored = (await getTemplate(name, locale)) !== null;
  } catch (error) {
    logNotify("removeTemplate:reread", error);
  }
  if (restored) editor(name, locale, { ok: t.emailAdmin.editor.restored });
  redirect(`/email?${new URLSearchParams({ ok: t.emailAdmin.editor.deleted })}`);
}

// The saved text, to the superadmin's own address, with the sample values:
// what a real recipient would get. Sent synchronously, so the answer already
// says whether the mail server took it. Logged as `test:<template>`, which the
// statistics leave out. notify-flow allows 5 per template and address per
// hour — the same allowance the superadmin's own real emails use.
export async function sendTemplateTest(formData: FormData) {
  const session = await requirePlatformAdmin("/email");
  const { t } = await getDictionary();
  const errors = t.emailAdmin.errors;
  const { name, locale } = target(formData);

  if (!session.email) editor(name, locale, { error: errors.noOwnEmail });

  let saved;
  try {
    saved = await getTemplate(name, locale);
  } catch (error) {
    logNotify("sendTemplateTest:read", error);
    editor(name, locale, { error: errors.unavailable });
  }
  if (!saved) editor(name, locale, { error: t.emailAdmin.editor.missing });

  // Exactly the variables the saved template declares: notify-flow refuses
  // any other set.
  const samples = sampleValues(SITE_URL, notifyConfig()?.appName ?? SITE_NAME);
  const variables = Object.fromEntries(saved.variables.map((v) => [v, samples[v] ?? "example"]));

  let result;
  try {
    result = await sendTest({ template: name, to: session.email, locale, variables });
  } catch (error) {
    const status = logNotify("sendTemplateTest", error);
    editor(name, locale, { error: status === 429 ? t.emailAdmin.test.rateLimited : errors.unavailable });
  }

  logOutcome("notify", `test:${name}`, { code: result.status, message: result.id, subjectId: session.userId });
  editor(name, locale, { test: result.id, status: result.status });
}

const MESSAGE_ID = /^msg_[0-9a-f-]{36}$/;

export async function refreshTestStatus(formData: FormData) {
  await requirePlatformAdmin("/email");
  const { t } = await getDictionary();
  const { name, locale } = target(formData);
  const id = String(formData.get("id") ?? "");
  if (!MESSAGE_ID.test(id)) editor(name, locale);

  let result;
  try {
    result = await emailStatus(id);
  } catch (error) {
    logNotify("refreshTestStatus", error);
    editor(name, locale, { test: id, error: t.emailAdmin.errors.unavailable });
  }
  editor(name, locale, { test: id, status: result.status, ...(result.errorCode ? { code: result.errorCode } : {}) });
}
