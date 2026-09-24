import type { Metadata } from "next";
import Link from "next/link";

import { AlertCircleIcon, BuildingIcon, ChevronLeftIcon } from "@/components/icons";
import { todayIn } from "@/utils/dates";
import {
  DEFAULT_LESSONS_PER_WEEK,
  DEFAULT_SESSION_LENGTH_HOURS,
  DEFAULT_TIMEZONE,
} from "@/utils/gym-defaults";
import { getDictionary } from "@/utils/i18n/server";
import { requirePlatformAdmin } from "@/utils/supabase/require-admin";
import { createGym } from "../actions";
import { GymFields } from "../gym-fields";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.gyms.newGym };
}

export default async function NewGymPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { t } = await getDictionary();
  await requirePlatformAdmin("/gyms/new");
  const today = todayIn(DEFAULT_TIMEZONE);

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:gap-5 sm:px-6 sm:py-7">
      <Link href="/gyms" className="flex w-fit items-center gap-1 text-sm font-medium text-accent hover:opacity-80">
        <ChevronLeftIcon className="h-4 w-4" />
        {t.gyms.back}
      </Link>

      <h1 className="flex items-center gap-2 font-heading text-xl font-semibold sm:text-2xl">
        <BuildingIcon className="h-5 w-5 shrink-0 text-accent" />
        {t.gyms.newGym}
      </h1>

      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <form action={createGym} className="flex flex-col gap-3 sm:gap-4">
        <GymFields
          t={t}
          today={today}
          defaults={{
            name: "",
            timezone: DEFAULT_TIMEZONE,
            trackingStartedOn: today,
            sessionLengthHours: DEFAULT_SESSION_LENGTH_HOURS,
            lessonsPerWeek: DEFAULT_LESSONS_PER_WEEK,
            latitude: null,
            longitude: null,
          }}
        />
        <button
          type="submit"
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t.gyms.create}
        </button>
      </form>
    </div>
  );
}
