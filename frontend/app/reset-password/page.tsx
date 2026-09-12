"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircleIcon } from "@/components/icons";
import { PasswordInput } from "@/components/password-input";
import { createClient } from "@/utils/supabase/client";

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // The SDK parses the #access_token=... fragment and fires the event
    // above automatically, but if it already fired before this component
    // subscribed, fall back to checking for a live session directly.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus((current) => (current === "checking" ? "ready" : current));
      }
    });

    const timeout = setTimeout(() => {
      setStatus((current) => (current === "checking" ? "invalid" : current));
    }, 2000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const password = formData.get("password") as string;
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("Non è stato possibile aggiornare la password. Richiedi un nuovo link.");
      return;
    }

    setStatus("done");
    window.setTimeout(() => router.push("/dashboard"), 1200);
  }

  if (status === "checking") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Reimposta password
        </h1>
        <p className="text-sm text-foreground/65">Verifica del link in corso…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Link non valido
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          Questo link per reimpostare la password non è valido o è scaduto.
        </p>
        <Link
          href="/forgot-password"
          className="w-fit rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Richiedi un nuovo link
        </Link>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Password aggiornata
        </h1>
        <p className="text-sm text-foreground/65">Ti sto reindirizzando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Scegli una nuova password
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">
          Minimo 6 caratteri.
        </p>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Nuova password
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="new-password"
          />
        </div>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Salva password
        </button>
      </form>
    </div>
  );
}
