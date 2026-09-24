import type { Metadata } from "next";
import QRCode from "qrcode";

import { AlertCircleIcon, CheckCircleIcon } from "@/components/icons";
import { LocationFields } from "@/components/location-fields";
import { getDictionary } from "@/utils/i18n/server";
import { SITE_URL } from "@/utils/site";
import { requireGymSettings } from "@/utils/supabase/gym";
import { requireUserManager } from "@/utils/supabase/require-admin";

import { setGymLocation } from "./actions";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.myGym.title };
}

const sectionClass = "flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-5";

// A manager's own gym: its position, which turns on the distance check at
// check-in, and the QR code to print. The QR holds one address for every gym,
// /check-in — the gym is the member's own — so a reprint is never needed.
export default async function MyGymPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;
  const { t } = await getDictionary();
  await requireUserManager("/gym");
  const gym = await requireGymSettings();

  // Generated here, from our own URL: no external service, no client script.
  const qrSvg = await QRCode.toString(`${SITE_URL}/check-in`, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="flex w-full flex-col gap-4 sm:gap-6">
      <header className="flex flex-col gap-2 print:hidden">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.myGym.title}</h1>
        <p className="text-sm leading-relaxed text-foreground/65">{t.myGym.lead}</p>
      </header>

      {ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-sm print:hidden">
          <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {ok}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent print:hidden">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <section className={`${sectionClass} print:hidden`}>
        <h2 className="font-heading text-base font-semibold sm:text-lg">{t.myGym.locationSection}</h2>
        {gym.latitude === null ? (
          <p className="text-sm text-foreground/65">{t.myGym.noLocation}</p>
        ) : null}
        <form action={setGymLocation} className="flex flex-col gap-4">
          <LocationFields
            defaults={{ latitude: gym.latitude, longitude: gym.longitude }}
            labels={{
              latitude: t.gyms.fields.latitude,
              longitude: t.gyms.fields.longitude,
              help: t.myGym.locationHelp,
              openMap: t.gyms.fields.openMap,
              useCurrent: t.myGym.useCurrent,
              locating: t.myGym.locating,
              geo: t.checkin.geo,
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              {t.myGym.save}
            </button>
            {gym.latitude !== null ? (
              <button
                type="submit"
                name="_clear"
                value="1"
                className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {t.myGym.clear}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className={sectionClass}>
        <h2 className="font-heading text-base font-semibold sm:text-lg print:hidden">
          {t.myGym.qrSection}
        </h2>
        <p className="text-sm text-foreground/65 print:hidden">{t.myGym.qrHelp}</p>
        {/* Black on white in both themes: a scanner needs the contrast, and
            this is what gets printed. */}
        <figure className="flex flex-col items-center gap-3 self-center rounded-xl bg-white p-6 text-black">
          <figcaption className="text-center text-lg font-semibold">{gym.name}</figcaption>
          <div
            className="h-56 w-56 sm:h-64 sm:w-64 [&>svg]:h-full [&>svg]:w-full"
            // The SVG comes from the qrcode library, built from SITE_URL.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-center text-sm">{t.myGym.qrCaption}</p>
        </figure>
        <PrintButton label={t.myGym.print} />
      </section>
    </div>
  );
}
