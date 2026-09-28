"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { CheckCircleIcon } from "@/components/icons";

// The acknowledgement is stored, not the consent — there is nothing to consent
// to. This app sets only cookies without which it cannot work: the Supabase
// session and the chosen language, plus the theme in localStorage. Under the
// ePrivacy Directive (Art. 5(3)) and the GDPR those are exempt from prior
// consent, so the banner informs and does not ask.
//
// That is why there is one button and no "reject": a reject that turns nothing
// off would be theatre, and a fake choice is worse than no choice — it invites
// the reader to believe a decision was made. The day an analytics script is
// added, this component has to become a real consent gate, storing a decision
// and loading nothing before it.
const STORAGE_KEY = "faixabjj-cookie-notice";
// Bump when the notice's substance changes: a stored "1" then stops matching
// and everybody sees the new text once.
const NOTICE_VERSION = "1";

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === NOTICE_VERSION;
  } catch {
    // Private mode, or storage blocked. Showing the notice again is the
    // harmless failure; suppressing it forever is not.
    return false;
  }
}

// Unknown on the server: the answer lives in the browser, and rendering the
// banner into the HTML would make it flash for everybody who has already
// dismissed it. null means "render nothing yet".
function getServerSnapshot(): boolean | null {
  return null;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_KEY, onChange);
  };
}

export function CookieNotice({
  text,
  more,
  accept,
}: {
  text: string;
  more: string;
  accept: string;
}) {
  const acknowledged = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  // null before hydration, true once dismissed.
  if (acknowledged !== false) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, NOTICE_VERSION);
    } catch {
      // Nothing to do: the banner reappears next visit, which is the correct
      // behaviour when the choice cannot be remembered.
    }
    window.dispatchEvent(new Event(STORAGE_KEY));
  };

  return (
    // Above the mobile tab bar, which is fixed at the bottom on small screens.
    // `role="region"` rather than `dialog`: it takes no focus and blocks
    // nothing — the site is fully usable while it sits there, which is what
    // makes a one-button notice legitimate in the first place.
    <div
      role="region"
      aria-label={text}
      className="fixed inset-x-0 bottom-16 z-30 px-3 pb-2 print:hidden sm:bottom-0 sm:px-4 sm:pb-4"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg sm:flex-row sm:items-center sm:gap-4">
        <p className="flex-1 text-sm leading-relaxed text-foreground/75">
          {text}{" "}
          <Link href="/privacy" className="font-medium text-accent underline">
            {more}
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <CheckCircleIcon className="h-4 w-4" />
          {accept}
        </button>
      </div>
    </div>
  );
}
