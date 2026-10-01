"use client";

import { useRef } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { useCopyFeedback } from "@/components/use-copy";

// The words are props: these are Client Components and cannot read the locale
// cookie, so the server hands them their own.
type CopyLabels = {
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
};

function Status({ state, copiedLabel, failedLabel }: { state: string } & Pick<CopyLabels, "copiedLabel" | "failedLabel">) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`text-xs ${state === "failed" ? "text-danger" : "text-success"}`}
    >
      {state === "copied" ? copiedLabel : state === "failed" ? failedLabel : ""}
    </span>
  );
}

// A temporary password that copies itself when clicked. It is a <button>, so
// the keyboard gets it for free; the text stays selectable, which is also the
// fallback when the clipboard refuses: the password is left selected, so Ctrl+C
// is one keystroke away.
export function CopyPassword({
  password,
  copyLabel,
  copiedLabel,
  failedLabel,
}: CopyLabels & { password: string }) {
  const { state, copy } = useCopyFeedback();
  const text = useRef<HTMLElement>(null);

  async function onClick() {
    const ok = await copy(password);
    const node = text.current;
    if (!ok && node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={onClick}
        title={copyLabel}
        aria-label={`${copyLabel}: ${password}`}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 text-left transition-opacity hover:opacity-80"
      >
        <code ref={text} className="font-medium">
          {password}
        </code>
        {state === "copied" ? (
          <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5 shrink-0 text-foreground/55" />
        )}
      </button>
      <Status state={state} copiedLabel={copiedLabel} failedLabel={failedLabel} />
    </span>
  );
}

// Copies a block of text composed on the server — here the whole set of
// credentials, ready to paste into the message that passes them on.
export function CopyCredentials({
  text,
  copyLabel,
  copiedLabel,
  failedLabel,
}: CopyLabels & { text: string }) {
  const { state, copy } = useCopyFeedback();

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => copy(text)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
      >
        {state === "copied" ? (
          <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        {copyLabel}
      </button>
      <Status state={state} copiedLabel={copiedLabel} failedLabel={failedLabel} />
    </span>
  );
}
