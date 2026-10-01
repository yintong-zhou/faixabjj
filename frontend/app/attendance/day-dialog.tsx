"use client";

import { useRef, type ReactNode } from "react";

// One day of the month grid on a phone: the cell is a button that opens the
// day's lessons in a modal. The grid cell has room for a number and a dot, not
// for course names, so the detail lives here.
//
// The native <dialog> does the modal work — focus trap, Esc, the backdrop,
// returning focus to the cell — so there is nothing to keep in sync. The
// lessons arrive as `children`, already rendered on the server; this component
// only opens and closes them.
//
// `contents` + `sm:hidden`: the wrapper takes no box of its own, so the button
// is the grid item, and from `sm` up the whole thing disappears in favour of
// the desktop cell.
export function DayDialog({
  cell,
  cellClassName,
  label,
  title,
  closeLabel,
  children,
}: {
  cell: ReactNode;
  cellClassName: string;
  label: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <div className="contents sm:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => dialog.current?.showModal()}
        className={cellClassName}
      >
        {cell}
      </button>

      {/* No padding on the dialog itself: a click on the backdrop lands on the
          dialog element, and padding would make a tap just inside the card
          count as one. */}
      <dialog
        ref={dialog}
        aria-label={title}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-semibold">{title}</h3>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
            >
              {closeLabel}
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </div>
  );
}
