"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

const CHANGE_EVENT = "faixabjj-theme-change";

function getSnapshot(): Theme {
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Unknown on the server — the blocking script in <head> (layout.tsx) already
// applies the stored theme before paint, so this only affects this button's
// own icon during the brief window before hydration.
function getServerSnapshot(): Theme | null {
  return null;
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// The two labels come from the server: this is a Client Component and cannot
// read the locale cookie itself.
export function ThemeToggle({
  toLight,
  toDark,
}: {
  toLight: string;
  toDark: string;
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Re-apply the stored theme after React has hydrated.
  //
  // The blocking script in <head> sets data-theme during HTML parsing, which is
  // all a production build needs. In development, though, Strict Mode remounts
  // once and resets <html> to only the attributes it manages from JSX — wiping
  // the one the script set, so the page renders in the wrong theme. This is a
  // no-op in production, and useLayoutEffect rather than useEffect so it still
  // runs before paint.
  useLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") {
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). The system
      // preference is then the right answer, and it already applies.
    }
  }, []);

  function toggle() {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem("theme", next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  if (theme === null) {
    return <span className="h-9 w-9 shrink-0" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? toLight : toDark}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-muted"
    >
      {theme === "dark" ? (
        <SunIcon className="h-4.5 w-4.5" />
      ) : (
        <MoonIcon className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
