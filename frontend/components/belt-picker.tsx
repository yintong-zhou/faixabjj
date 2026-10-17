"use client";

import Image from "next/image";
import { useEffect, useId, useRef } from "react";

import { CheckIcon, ChevronRightIcon } from "@/components/icons";

export type BeltOption = { value: string; label: string; src: string | null };
export type BeltOptionGroup = { label?: string; options: BeltOption[] };

// The belt on the same bordered plate as components/belt.tsx, so white and
// black stay visible in both themes. Decorative here: the name sits beside it.
function BeltArt({ src }: { src: string | null }) {
  if (!src) return null;
  return (
    <span className="inline-flex shrink-0 rounded-[4px] border border-border bg-muted p-[3px]">
      <Image src={src} alt="" width={60} height={18} />
    </span>
  );
}

/**
 * A dropdown whose options are belts drawn beside their names — a belt to
 * pick, or the same belt with a number of stripes.
 *
 * A native <select> cannot hold an image, so this is <details> with a radio
 * group inside: the radios post `name` with the form exactly as a select
 * would, and bring keyboard and screen-reader behaviour for free (Tab into the
 * group, arrows move, the group has a name). Without JavaScript it still opens
 * and still posts; only the summary would not follow the choice.
 *
 * Controlled: the caller holds the value, so two pickers can depend on each
 * other (the stripes follow the belt).
 *
 * Closes on a pointer pick, Escape, Enter (which in a form would otherwise
 * submit it) and a press outside. Arrow keys only move the choice: the click
 * a radio fires for them has `detail` 0, a real press does not.
 */
export function BeltPicker({
  name,
  label,
  groups,
  value,
  onChange,
}: {
  name: string;
  label: string;
  groups: BeltOptionGroup[];
  value: string;
  onChange: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const labelId = useId();
  const valueId = useId();
  const selected = groups.flatMap((g) => g.options).find((o) => o.value === value);

  const close = (refocus: boolean) => {
    if (!detailsRef.current?.open) return;
    detailsRef.current.open = false;
    if (refocus) summaryRef.current?.focus();
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs text-foreground/65">
      <span id={labelId}>{label}</span>
      <details ref={detailsRef} className="group relative">
        <summary
          ref={summaryRef}
          aria-labelledby={`${labelId} ${valueId}`}
          className="flex h-11 w-full cursor-pointer list-none items-center gap-2.5 rounded-lg border border-border bg-background pl-2 pr-3 text-sm text-foreground select-none hover:bg-muted [&::-webkit-details-marker]:hidden"
        >
          <BeltArt src={selected?.src ?? null} />
          <span id={valueId} className="min-w-0 flex-1 truncate">
            {selected?.label}
          </span>
          <ChevronRightIcon className="h-4 w-4 shrink-0 rotate-90 text-foreground/60 transition-transform group-open:-rotate-90" />
        </summary>

        <div
          role="radiogroup"
          aria-labelledby={labelId}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              close(true);
            }
          }}
          className="absolute left-0 top-full z-30 mt-1 flex max-h-80 w-max min-w-full flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {groups.map((group, i) => (
            <div key={group.label ?? i} className="flex flex-col">
              {group.label ? (
                <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-foreground/55">
                  {group.label}
                </p>
              ) : null}
              {group.options.map((option) => {
                const checked = option.value === value;
                return (
                  <label
                    key={option.value}
                    onClick={(event) => {
                      if (event.detail > 0) close(false);
                    }}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap text-foreground hover:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                      checked ? "bg-muted font-medium" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={option.value}
                      checked={checked}
                      onChange={() => onChange(option.value)}
                      className="sr-only"
                    />
                    <BeltArt src={option.src} />
                    <span className="flex-1">{option.label}</span>
                    <CheckIcon
                      className={`h-4 w-4 shrink-0 text-accent ${checked ? "" : "invisible"}`}
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
