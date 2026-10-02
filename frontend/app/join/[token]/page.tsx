import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Turnstile } from "@/components/turnstile";
import { getDictionary } from "@/utils/i18n/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { gymForInvite } from "@/utils/supabase/invite";
import { beltLabels } from "@/utils/supabase/profile";

import { checkUsername, register } from "../actions";
import { JoinForm } from "./join-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.join.form.submit, robots: { index: false } };
}

// Public: whoever holds the gym's link may ask to join. An unknown,
// regenerated or suspended gym's link answers 404, like any page that does not
// exist. The gym's name is read with the service role — a visitor has no
// session, and gym_for_invite() has just vouched for this gym.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getDictionary();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    notFound();
  }
  const gymId = await gymForInvite(admin, token);
  if (!gymId) notFound();
  const { data: gym } = await admin.from("gym").select("name").eq("id", gymId).single();
  if (!gym) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.join.title((gym as { name: string }).name)}
        </h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.join.lead}</p>
      </div>
      <JoinForm
        action={register.bind(null, token)}
        checkUsername={checkUsername.bind(null, token)}
        labels={t.join.form}
        belts={Object.entries(beltLabels(t)).map(([value, label]) => ({ value, label }))}
        turnstile={<Turnstile action="register" />}
      />
    </div>
  );
}
