"use client";

import { useSyncExternalStore } from "react";
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

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
      aria-label={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground/70 transition-colors hover:bg-neutral-light/60"
    >
      {theme === "dark" ? (
        <SunIcon className="h-4.5 w-4.5" />
      ) : (
        <MoonIcon className="h-4.5 w-4.5" />
      )}
    </button>
  );
}
