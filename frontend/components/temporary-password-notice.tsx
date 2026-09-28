import { KeyIcon } from "@/components/icons";
import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import type { TemporaryPasswordFlash } from "@/utils/temporary-password-flash";

// The one place a temporary password is ever shown: right after the action that
// drew it, to the maestro who has to pass it on. See temporary-password-flash.ts
// for why it arrives in a cookie rather than beside the other `?ok=` messages.
export function TemporaryPasswordNotice({
  t,
  flash,
}: {
  t: Dictionary;
  flash: TemporaryPasswordFlash | null;
}) {
  if (!flash) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
      <KeyIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-col gap-1">
        <span>
          {t.registro.temporaryPasswordFor(flash.email)}{" "}
          <code className="select-all rounded bg-muted px-1.5 py-0.5 font-medium">
            {flash.password}
          </code>
        </span>
        <span className="text-xs text-foreground/60">{t.registro.temporaryPasswordHelp}</span>
      </div>
    </div>
  );
}
