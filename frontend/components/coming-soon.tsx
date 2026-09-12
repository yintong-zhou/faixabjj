import type { ComponentType } from "react";

type ComingSoonProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  detail: string;
};

export function ComingSoon({
  icon: Icon,
  title,
  description,
  detail,
}: ComingSoonProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:gap-3">
        <Icon className="h-7 w-7 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-foreground/65">
          {description}
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-surface px-3.5 py-2.5 text-sm text-foreground/60 sm:w-fit sm:px-4 sm:py-3">
        {detail}
      </div>
    </div>
  );
}
