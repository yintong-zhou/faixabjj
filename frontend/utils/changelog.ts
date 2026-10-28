import type { Dictionary } from "@/utils/i18n/dictionaries/it";

// What /changelog tells a visitor. Only the facts live here — which feature,
// when it arrived, which belt (if any) illustrates it. The words are in the
// dictionaries under `changelog.entries`, keyed by `id`, so the three languages
// stay in step and a missing translation is a compile error.
//
// Oldest first, on purpose: the page reads as the story of the app and ends on
// the newest entry, followed by the "next one is coming" slot. To publish a
// novelty, add its dictionary text in the three languages and append one line
// here. changelog.test.ts refuses an out-of-order date or an untranslated id.
//
// Deliberately absent: platform-level tooling (the superadmin's logs and
// gym management). Visitors read this page; it describes what a gym and its
// members get.
export type ChangelogId = keyof Dictionary["changelog"]["entries"];

export type ChangelogEntry = {
  id: ChangelogId;
  /** YYYY-MM-DD, shown through formatDate(). */
  date: string;
  /** Drawn under the text, through <Belt>. */
  belt?: { belt: string; stripes: number };
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  { id: "courses", date: "2026-09-12" },
  { id: "languages", date: "2026-09-13" },
  { id: "promotions", date: "2026-09-18", belt: { belt: "purple", stripes: 2 } },
  { id: "multiGym", date: "2026-09-24" },
  { id: "checkinQr", date: "2026-09-24" },
  { id: "username", date: "2026-09-29" },
  { id: "dashboard", date: "2026-10-01" },
  { id: "invite", date: "2026-10-03" },
  { id: "blackBelt", date: "2026-10-17", belt: { belt: "black", stripes: 3 } },
  { id: "emailTemplates", date: "2026-10-19" },
  { id: "checkinButton", date: "2026-10-27" },
];

export const LAST_UPDATED = CHANGELOG[CHANGELOG.length - 1].date;

export type ChangelogMonth = {
  /** YYYY-MM-01, ready for formatMonthHeading(). */
  month: string;
  entries: ChangelogEntry[];
};

/** Consecutive entries of the same month, in the order given. */
export function groupByMonth(entries: readonly ChangelogEntry[]): ChangelogMonth[] {
  const months: ChangelogMonth[] = [];
  for (const entry of entries) {
    const month = `${entry.date.slice(0, 7)}-01`;
    const last = months[months.length - 1];
    if (last?.month === month) {
      last.entries.push(entry);
    } else {
      months.push({ month, entries: [entry] });
    }
  }
  return months;
}
