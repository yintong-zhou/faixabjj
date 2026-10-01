import { CopyCredentials, CopyPassword } from "@/components/copy-password";
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

  // What "copy the credentials" puts on the clipboard: the same fields as on
  // screen, then the reminder the person needs, in the maestro's language.
  const copied = [
    ...(flash.username ? [`${t.registro.temporaryUsernameIs} ${flash.username}`] : []),
    `${t.registro.temporaryEmailIs} ${flash.email}`,
    `${t.registro.temporaryPasswordIs} ${flash.password}`,
    "",
    t.registro.credentialsMustChange,
  ].join("\n");

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
      <KeyIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-col gap-2">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
          {flash.username ? (
            <>
              <dt className="text-foreground/65">{t.registro.temporaryUsernameIs}</dt>
              <dd>
                <code className="select-all rounded bg-muted px-1.5 py-0.5 font-medium">
                  {flash.username}
                </code>
              </dd>
            </>
          ) : null}
          <dt className="text-foreground/65">{t.registro.temporaryEmailIs}</dt>
          <dd className="select-all break-all">{flash.email}</dd>
          <dt className="text-foreground/65">{t.registro.temporaryPasswordIs}</dt>
          <dd>
            <CopyPassword
              password={flash.password}
              copyLabel={t.registro.copyPassword}
              copiedLabel={t.registro.passwordCopied}
              failedLabel={t.registro.passwordCopyFailed}
            />
          </dd>
        </dl>
        <CopyCredentials
          text={copied}
          copyLabel={t.registro.copyCredentials}
          copiedLabel={t.registro.credentialsCopied}
          failedLabel={t.registro.passwordCopyFailed}
        />
        <span className="text-xs text-foreground/60">{t.registro.temporaryPasswordHelp}</span>
      </div>
    </div>
  );
}
