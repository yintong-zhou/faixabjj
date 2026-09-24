import type { Dictionary } from "@/utils/i18n/dictionaries/it";
import { GYM_TIMEZONES } from "@/utils/gym-defaults";

const fieldClass =
  "rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent";

export type GymFieldDefaults = {
  name: string;
  timezone: string;
  trackingStartedOn: string;
  sessionLengthHours: number;
  lessonsPerWeek: number;
};

// The same five fields for "new gym" and for a gym's settings, so the two
// forms cannot drift. The server re-validates everything (utils/gyms.ts).
export function GymFields({
  t,
  defaults,
  today,
}: {
  t: Dictionary;
  defaults: GymFieldDefaults;
  today: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="name" className="text-sm font-medium">{t.gyms.fields.name}</label>
        <input id="name" name="name" required maxLength={120} defaultValue={defaults.name} className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="timezone" className="text-sm font-medium">{t.gyms.fields.timezone}</label>
        <select id="timezone" name="timezone" defaultValue={defaults.timezone} className={fieldClass}>
          {GYM_TIMEZONES.map((zone) => (
            <option key={zone} value={zone}>{zone.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tracking_started_on" className="text-sm font-medium">{t.gyms.fields.trackingStartedOn}</label>
        <input
          id="tracking_started_on"
          name="tracking_started_on"
          type="date"
          required
          max={today}
          defaultValue={defaults.trackingStartedOn}
          className={fieldClass}
        />
        <p className="text-xs text-foreground/55">{t.gyms.fields.trackingHelp}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="session_length_hours" className="text-sm font-medium">{t.gyms.fields.sessionLengthHours}</label>
        <input
          id="session_length_hours"
          name="session_length_hours"
          type="number"
          required
          min={0.5}
          max={8}
          step={0.5}
          defaultValue={defaults.sessionLengthHours}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="lessons_per_week" className="text-sm font-medium">{t.gyms.fields.lessonsPerWeek}</label>
        <input
          id="lessons_per_week"
          name="lessons_per_week"
          type="number"
          required
          min={0.5}
          max={14}
          step={0.5}
          defaultValue={defaults.lessonsPerWeek}
          className={fieldClass}
        />
      </div>
    </div>
  );
}
