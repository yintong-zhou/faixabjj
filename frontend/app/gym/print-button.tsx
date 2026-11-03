"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="self-start rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted print:hidden bg-surface raised-button"
    >
      {label}
    </button>
  );
}
