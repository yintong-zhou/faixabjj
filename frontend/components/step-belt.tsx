/**
 * A step marker drawn as a small belt: the accent body, the rank bar, and as
 * many stripes on it as the step's number. Used where the content really is a
 * sequence (the landing page's "how it works", /demo's "what happens next").
 * The surrounding <ol> already gives assistive technology the number, so the
 * drawing is hidden from it.
 */
export function StepBelt({ stripes }: { stripes: number }) {
  return (
    <span aria-hidden className="flex h-3 w-16 overflow-hidden rounded-[2px]">
      <span className="flex-1 bg-accent" />
      <span className="flex w-7 items-stretch justify-end gap-[3px] bg-foreground px-1">
        {Array.from({ length: stripes }, (_, i) => (
          <span key={i} className="w-[3px] bg-background" />
        ))}
      </span>
    </span>
  );
}
