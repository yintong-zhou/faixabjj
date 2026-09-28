"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/icons";
import { NAVIGATION_START_EVENT } from "@/components/pending-feedback";

// How long typing has to pause before the list is fetched again: short enough
// to feel immediate, long enough not to query on every keystroke.
const DEBOUNCE_MS = 250;

// Search-as-you-type for the Registro, by name only.
//
// The list stays server-rendered: this only rewrites `q` in the URL (replace,
// not push, so typing a name does not leave a dozen history entries) and the
// page queries again. Paging restarts at page one, and the one-off `ok`,
// `error` and `pw` messages of the last action are dropped — they belong to the
// list that action returned to, not to the next search.
//
// The other filters come in as `baseQuery` from the server, which already has
// them, rather than from useSearchParams(). Without JavaScript this is still a
// plain GET form that carries those same filters, submitted with Enter.
export function NameSearch({
  initialQuery,
  baseQuery,
  filterFormId,
  label,
  placeholder,
  pendingLabel,
}: {
  initialQuery: string;
  baseQuery: string;
  // The filters panel's form, which carries `q` in a hidden field of its own.
  filterFormId: string;
  label: string;
  placeholder: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What is in the box right now, for the submit listener below, which is
  // registered once and would otherwise see the value of its first render.
  const latest = useRef(initialQuery);

  // Applying a filter while a search is still waiting on its pause must keep
  // both. The filters form was rendered with the `q` of the last server
  // response, so on submit it gets the text as it is now, and the pending
  // search is cancelled — otherwise it would fire afterwards with the old
  // filters and undo the ones just applied. An empty box submits no `q`.
  useEffect(() => {
    const form = document.getElementById(filterFormId);
    if (!(form instanceof HTMLFormElement)) return;
    const onSubmit = () => {
      if (timer.current) clearTimeout(timer.current);
      const field = form.elements.namedItem("q");
      if (field instanceof HTMLInputElement) {
        const term = latest.current.trim();
        field.value = term;
        field.disabled = !term;
      }
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [filterFormId]);

  // A navigation that did not come from typing here — "Azzera", a filter form,
  // the back button — brings a new `q` from the server. Adopt it, but never
  // while the reader is typing, or their next keystroke would be overwritten.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setValue(initialQuery);
      latest.current = initialQuery;
    }
  }, [initialQuery]);

  // Following a link or submitting any other form while a search is waiting
  // on its pause: the search must not fire afterwards and replace the page the
  // reader just asked for with the list and the old filters.
  useEffect(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
    };
    window.addEventListener(NAVIGATION_START_EVENT, cancel);
    return () => {
      cancel();
      window.removeEventListener(NAVIGATION_START_EVENT, cancel);
    };
  }, []);

  const navigate = (next: string) => {
    const params = new URLSearchParams(baseQuery);
    const term = next.trim();
    if (term) params.set("q", term);
    else params.delete("q");
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `/members?${search}` : "/members", { scroll: false });
    });
  };

  const onChange = (next: string) => {
    setValue(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  };

  const hidden = [...new URLSearchParams(baseQuery).entries()];

  return (
    <form
      role="search"
      // Has its own "loading" inside the field; no screen lock while typing.
      data-pending-ignore=""
      method="get"
      action="/members"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate(value);
      }}
      className="relative flex w-full items-center"
    >
      {hidden.map(([key, v]) => (
        <input key={key} type="hidden" name={key} value={v} />
      ))}
      <label htmlFor="registry-q" className="sr-only">
        {label}
      </label>
      <SearchIcon className="pointer-events-none absolute left-3.5 h-4.5 w-4.5 text-foreground/45" />
      <input
        ref={inputRef}
        id="registry-q"
        name="q"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-busy={isPending}
        className="min-h-11 w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none focus:border-accent"
      />
      {/* Centred over the field rather than at its right end, where it used to
          push the browser's clear button inwards (the input needed a wide right
          padding to make room for it). */}
      {isPending ? (
        <span
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-foreground/50"
        >
          {pendingLabel}
        </span>
      ) : null}
    </form>
  );
}
