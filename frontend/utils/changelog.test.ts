import { describe, expect, it } from "vitest";

import { en } from "./i18n/dictionaries/en";
import { it as italian } from "./i18n/dictionaries/it";
import { ptBR } from "./i18n/dictionaries/pt-BR";
import { beltImageSrc } from "./belt-artwork";
import { CHANGELOG, LAST_UPDATED, groupByMonth } from "./changelog";

describe("CHANGELOG", () => {
  it("is oldest first, so the newest entry closes the page", () => {
    const dates = CHANGELOG.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort());
    expect(LAST_UPDATED).toBe(dates[dates.length - 1]);
  });

  it("lists each id once and has its text in every language", () => {
    const ids = CHANGELOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const dictionary of [italian, en, ptBR]) {
      for (const id of ids) {
        const text = dictionary.changelog.entries[id];
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("only draws belts that have artwork", () => {
    for (const { belt } of CHANGELOG) {
      if (belt) expect(beltImageSrc(belt.belt, belt.stripes)).not.toBeNull();
    }
  });
});

describe("groupByMonth", () => {
  it("groups consecutive entries of a month and keeps their order", () => {
    const months = groupByMonth(CHANGELOG);
    expect(months.map((group) => group.month)).toEqual(["2026-09-01", "2026-10-01"]);
    expect(months.flatMap((group) => group.entries)).toEqual([...CHANGELOG]);
  });
});
