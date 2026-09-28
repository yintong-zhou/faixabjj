"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Tells the reader their click was taken and the app is working on it.
//
// Every write in this app is a server action behind a plain <form>, and every
// move a link, so a pressed button used to look exactly like an unpressed one
// until the next page arrived. Rather than threading a pending state through
// every button, one listener covers them all:
//
//   - a submitted form marks the button that submitted it (`data-pending`);
//     globals.css draws three belt stripes filling in beside its label, and a
//     second submit of the same form is refused until the answer comes;
//   - a submit also locks the screen: at once for input, and after a short
//     pause visibly, with a rolled-up belt turning in the middle — the pause
//     keeps a quick action from flashing a veil;
//   - a submit or an in-app link runs the belt bar across the top.
//
// All of it ends when the URL changes — every action here ends in a redirect —
// and after a safety timeout, for the rare action that lands on the same URL.
//
// The listeners sit on `window` in the CAPTURE phase, on purpose. React handles
// both a server-action form and a <Link> itself and calls preventDefault() on
// the native event, so a listener after React's sees every one of them as
// "cancelled" — which is why this showed nothing at first. In capture we see
// the event before React does. What cancels a submit here does so earlier, at
// the click (the confirm dialog), so no submit event fires at all; a form that
// handles its own submit (the live search) opts out with `data-pending-ignore`.
//
// `faixabjj-navigation-start` is announced on window for components that must
// drop pending work of their own when the reader goes elsewhere — the live
// search's debounce, which would otherwise fire afterwards and undo the move.

export const NAVIGATION_START_EVENT = "faixabjj-navigation-start";

const SAFETY_TIMEOUT_MS = 8_000;

function clearPending() {
  for (const el of document.querySelectorAll("[data-pending]")) {
    el.removeAttribute("data-pending");
    el.removeAttribute("aria-busy");
  }
}

function isInAppNavigation(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Same page, only the hash differs: the browser scrolls, nothing loads.
  return !(
    url.pathname === window.location.pathname && url.search === window.location.search
  );
}

type Pending = { on: string; blocking: boolean };

export function PendingFeedback({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams.toString()}`;
  // The URL the wait began on. Pending means "still on that URL": the moment
  // the answer lands somewhere new, it is over, with no state to reset.
  const [pending, setPending] = useState<Pending | null>(null);
  const active = pending?.on === url;
  const blocking = active && pending.blocking;
  const urlRef = useRef(url);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const start = (block: boolean) => {
      setPending({ on: urlRef.current, blocking: block });
      window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        clearPending();
        setPending(null);
      }, SAFETY_TIMEOUT_MS);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.hasAttribute("data-pending-ignore")) return;
      // The same form sent twice by an impatient second tap would run the
      // action twice — two promotions, two password resets. Stopped here,
      // before React, so the action is never started.
      if (form.hasAttribute("data-pending")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      form.setAttribute("data-pending", "");
      const button = event.submitter;
      if (button instanceof HTMLElement) {
        button.setAttribute("data-pending", "");
        button.setAttribute("aria-busy", "true");
      }
      start(true);
    };

    const onClick = (event: MouseEvent) => {
      if (isInAppNavigation(event)) start(false);
    };

    // Coming back through the back/forward cache restores the page exactly as
    // it was left — pending marks included.
    const onPageShow = () => {
      clearPending();
      setPending(null);
    };

    window.addEventListener("submit", onSubmit, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // A new URL is the answer arriving: the marks on the pressed button go.
  useEffect(() => {
    urlRef.current = url;
    clearPending();
  }, [url]);

  return (
    <>
      <div className="belt-progress" data-active={active ? "" : undefined} aria-hidden="true">
        <span className="belt-progress__belt" />
      </div>

      {blocking ? (
        <div className="pending-overlay" role="status" aria-live="polite">
          <div className="pending-overlay__card">
            {/* A belt rolled into a ring: the accent is the belt, the dark arc
                its rank bar, the two light marks its stripes. */}
            <svg viewBox="0 0 48 48" className="pending-overlay__belt" aria-hidden="true">
              <circle cx="24" cy="24" r="18" className="pending-overlay__track" />
              <circle cx="24" cy="24" r="18" className="pending-overlay__body" />
              <circle cx="24" cy="24" r="18" className="pending-overlay__tip" />
              <circle cx="24" cy="24" r="18" className="pending-overlay__stripe pending-overlay__stripe--1" />
              <circle cx="24" cy="24" r="18" className="pending-overlay__stripe pending-overlay__stripe--2" />
            </svg>
            <span className="text-sm font-medium">{label}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
