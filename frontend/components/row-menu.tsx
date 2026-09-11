"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { KebabIcon } from "@/components/icons";

// Per-row actions live behind this menu so a destructive control is never one
// stray tap away. The menu contents are server-rendered forms passed in as
// children, so the server actions keep working from a Client Component.
export function RowMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-neutral-light/60 ${
          open ? "bg-neutral-light/60" : ""
        }`}
      >
        <KebabIcon className="h-5 w-5" />
      </button>

      {open ? (
        // Closing on submit is unnecessary: every action navigates, which
        // remounts the row and resets this state.
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 flex w-60 flex-col rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
