"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

// "Check your inbox", in a modal nobody can scroll past. A line in the page's
// green notice was not enough: an email-change link went to spam and the
// reader never knew a message had been sent at all.
//
// Any action that sends an email to the person who acted adds `?mail=<kind>`
// to the URL it redirects to; this component, mounted once in the layout,
// opens on it. Closing drops the parameter, so a reload doesn't reopen it.
// The native <dialog> does the modal work, as in app/attendance/day-dialog.tsx.

// Spelled out at each redirect rather than imported: a value exported from a
// "use client" module reaches server code as a client reference, not a string.
type EmailNoticeKind = "email-change" | "password" | "reset";

const EMAIL_NOTICE_PARAM = "mail";

type Texts = { title: string; body: string };

export function EmailNotice({
  texts,
  spamHint,
  closeLabel,
}: {
  texts: Record<EmailNoticeKind, Texts>;
  spamHint: string;
  closeLabel: string;
}) {
  const searchParams = useSearchParams();
  const kind = searchParams.get(EMAIL_NOTICE_PARAM);
  // Own keys only: `in` would also let `?mail=toString` open an empty modal.
  const content = kind && Object.hasOwn(texts, kind) ? texts[kind as EmailNoticeKind] : null;
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (content && !dialog.current?.open) dialog.current?.showModal();
  }, [content]);

  if (!content) return null;

  const dropParam = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete(EMAIL_NOTICE_PARAM);
    window.history.replaceState(null, "", url);
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="email-notice-title"
      onClose={dropParam}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id="email-notice-title" className="font-heading text-lg font-semibold">
          {content.title}
        </h2>
        <p className="text-sm leading-relaxed text-foreground/75">{content.body}</p>
        <p className="text-sm leading-relaxed text-foreground/75">{spamHint}</p>
        <button
          type="button"
          autoFocus
          onClick={() => dialog.current?.close()}
          className="mt-2 self-end rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {closeLabel}
        </button>
      </div>
    </dialog>
  );
}
