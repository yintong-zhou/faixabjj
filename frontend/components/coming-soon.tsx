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
    <div className="flex flex-col gap-6 pt-4 sm:pt-10">
      <div className="flex flex-col gap-3">
        <Icon className="h-7 w-7 text-accent" />
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-foreground/65">
          {description}
        </p>
      </div>
      <div className="w-fit rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-sm text-foreground/60">
        {detail}
      </div>
    </div>
  );
}
