"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

// The words are props: this is a Client Component and cannot read the locale
// cookie, so the server hands it its own.
type CopyPasswordProps = {
  password: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
};

type State = "idle" | "copied" | "failed";

// A temporary password that copies itself when clicked. It is a <button>, so
// the keyboard gets it for free; the text stays selectable, which is also the
// fallback when the clipboard refuses (insecure context, denied permission).
export function CopyPassword({
  password,
  copyLabel,
  copiedLabel,
  failedLabel,
}: CopyPasswordProps) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = useRef<HTMLSpanElement>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Selects the password and asks the browser to copy the selection. Needs no
  // clipboard permission, only the user gesture we are already inside, so it
  // still works where navigator.clipboard is refused. Either way the password
  // is left selected, so Ctrl+C is one keystroke away if this fails too.
  function copyBySelection(): boolean {
    const node = text.current;
    if (!node) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }

  async function copy() {
    let next: State = "copied";
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      next = copyBySelection() ? "copied" : "failed";
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), next === "failed" ? 4000 : 2000);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={copy}
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
      <span
        role="status"
        aria-live="polite"
        className={`text-xs ${state === "failed" ? "text-danger" : "text-success"}`}
      >
        {state === "copied" ? copiedLabel : state === "failed" ? failedLabel : ""}
      </span>
    </span>
  );
}
