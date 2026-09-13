import type { ReactNode } from "react";

/**
 * One number with its label. Deliberately plain: a dashboard is read at a
 * glance before class, and a grid of identical tiles is scanned faster than a
 * set of differently decorated cards.
 */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <span className="text-xs uppercase tracking-wide text-foreground/55">
        {label}
      </span>
      <span className="font-heading text-2xl font-bold leading-none">{value}</span>
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </div>
  );
}

export function Section({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: (props: { className?: string }) => ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 sm:gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Icon className="h-4.5 w-4.5 shrink-0 text-accent" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
