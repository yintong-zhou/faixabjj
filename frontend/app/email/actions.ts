"use server";

import { redirect } from "next/navigation";

import { APP_TEMPLATES, declaredVariables, isAppTemplate, isTemplateName, unknownPlaceholders } from "@/utils/email-templates";
import { isLocale, type Locale } from "@/utils/i18n/locales";
import { getDictionary } from "@/utils/i18n/server";
import { logDbError, logEvent } from "@/utils/log";
import { deleteTemplate, getTemplate, putTemplate } from "@/utils/notify-admin";
import { NotifyError } from "@/utils/notify-flow";
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
