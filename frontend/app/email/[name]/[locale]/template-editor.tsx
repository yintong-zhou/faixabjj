"use client";

import { useState } from "react";

import { declaredVariables, renderPreview, unknownPlaceholders } from "@/utils/email-templates";

import { saveTemplate } from "../../actions";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

// The editing half of /email/<name>/<locale> (layout A, chosen with the user):
// subject, then HTML and its preview side by side — stacked on a phone — then
// the plain text, written by hand. The preview is the HTML with sample values,
// in a sandboxed iframe with no scripts: an email's markup never runs in the
// app's page. It follows every keystroke; nothing is saved until Save.
export function TemplateEditor({
  name,
  locale,
  isNew,
  initial,
  allowed,
  samples,
  labels,
}: {
  name: string;
  locale: string;
  isNew: boolean;
  initial: { subject: string; html: string; text: string };
  /** The fixed variables of an email the app sends; null for any other template. */
  allowed: string[] | null;
  samples: Record<string, string>;
  labels: {
    subject: string;
    html: string;
    preview: string;
    previewTitle: string;
    text: string;
    textHint: string;
    variables: string;
    allowed: string | null;
    /** With `{list}` where the placeholder names go. */
    unknownWarning: string;
    save: string;
  };
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [html, setHtml] = useState(initial.html);
  const [text, setText] = useState(initial.text);

  const parts = [subject, html, text];
  const unknown = allowed ? unknownPlaceholders(parts, allowed) : [];
  const variables = declaredVariables(name, parts);

  return (
    <form action={saveTemplate} className="flex flex-col gap-4">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="locale" value={locale} />
      {isNew ? <input type="hidden" name="new" value="1" /> : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{labels.subject}</span>
        <input
          name="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={255}
          required
          className={field}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{labels.html}</span>
          <textarea
            name="html"
            value={html}
            onChange={(event) => setHtml(event.target.value)}
            required
            spellCheck={false}
            rows={20}
            className={`${field} min-h-80 font-mono text-xs leading-relaxed`}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{labels.preview}</span>
          {/* sandbox="" with no allow-* token: no scripts, no forms, no top
              navigation. White on purpose: an email client shows it so. */}
          <iframe
            title={labels.previewTitle}
            sandbox=""
            srcDoc={renderPreview(html, samples)}
            className="min-h-80 w-full flex-1 rounded-lg border border-border bg-white"
          />
        </div>
      </div>

      {unknown.length > 0 ? (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent" role="status">
          {labels.unknownWarning.replace("{list}", unknown.join(", "))}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{labels.text}</span>
        <span className="text-xs text-foreground/55">{labels.textHint}</span>
        <textarea
          name="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
          rows={8}
          className={`${field} font-mono text-xs leading-relaxed`}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{labels.variables}</span>
        {labels.allowed ? <span className="text-xs text-foreground/55">{labels.allowed}</span> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {variables.map((variable) => (
            <div key={variable} className="contents">
              <dt className="font-mono">{variable}</dt>
              <dd className="truncate text-foreground/65">{samples[variable] ?? "example"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <button
        type="submit"
        className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        {labels.save}
      </button>
    </form>
  );
}
