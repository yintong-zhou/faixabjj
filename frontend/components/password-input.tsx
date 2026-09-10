"use client";

import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

type PasswordInputProps = {
  id?: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
};

export function PasswordInput({
  id,
  name,
  required,
  autoComplete,
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={inputId}
        name={name}
        type={visible ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 pr-11 text-sm outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Nascondi password" : "Mostra password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-foreground/50 transition-colors hover:text-foreground/80"
      >
        {visible ? (
          <EyeOffIcon className="h-4.5 w-4.5" />
        ) : (
          <EyeIcon className="h-4.5 w-4.5" />
        )}
      </button>
    </div>
  );
}
