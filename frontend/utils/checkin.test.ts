import { describe, expect, it } from "vitest";

import { it as itDict } from "./i18n/dictionaries/it";
import {
  checkinMessage,
  geoFailure,
  mapUrl,
  optionalNumber,
  parseCheckinOutcome,
} from "./checkin";

describe("parseCheckinOutcome", () => {
  it("reads the six known results", () => {
    for (const result of ["ok", "already", "closed", "location_needed", "imprecise", "too_far"]) {
      expect(parseCheckinOutcome({ result, distance_m: null })).toEqual({ result, distanceM: null });
    }
    expect(parseCheckinOutcome({ result: "too_far", distance_m: 111 })).toEqual({
      result: "too_far",
      distanceM: 111,
    });
  });

  it("refuses anything else", () => {
    expect(parseCheckinOutcome(null)).toBeNull();
    expect(parseCheckinOutcome("ok")).toBeNull();
    expect(parseCheckinOutcome({ result: "maybe" })).toBeNull();
    expect(parseCheckinOutcome({})).toBeNull();
  });
});

describe("checkinMessage", () => {
  it("treats ok and already as success", () => {
    expect(checkinMessage({ result: "ok", distanceM: 12 }, itDict)).toEqual({
      ok: true,
      text: itDict.msg.checkinRecorded,
    });
    expect(checkinMessage({ result: "already", distanceM: null }, itDict)).toEqual({
      ok: true,
      text: itDict.msg.alreadyPresent,
    });
  });

  it("maps every refusal to its own message", () => {
    expect(checkinMessage({ result: "closed", distanceM: null }, itDict)).toEqual({
      ok: false,
      text: itDict.msg.checkinClosed,
    });
    expect(checkinMessage({ result: "location_needed", distanceM: null }, itDict).text).toBe(
      itDict.checkin.locationNeeded,
    );
    expect(checkinMessage({ result: "imprecise", distanceM: null }, itDict).text).toBe(
      itDict.checkin.imprecise,
    );
    expect(checkinMessage({ result: "too_far", distanceM: 240 }, itDict)).toEqual({
      ok: false,
      text: itDict.checkin.tooFar(240),
    });
  });
});

describe("geoFailure", () => {
  it("maps GeolocationPositionError codes", () => {
    expect(geoFailure(1)).toBe("denied");
    expect(geoFailure(2)).toBe("unavailable");
    expect(geoFailure(3)).toBe("timeout");
    expect(geoFailure(99)).toBe("unavailable");
  });
});

describe("optionalNumber", () => {
  it("reads a finite number and nothing else", () => {
    expect(optionalNumber("45.4642")).toBe(45.4642);
    expect(optionalNumber(" -9.5 ")).toBe(-9.5);
    expect(optionalNumber("")).toBeNull();
    expect(optionalNumber("abc")).toBeNull();
    expect(optionalNumber("NaN")).toBeNull();
    expect(optionalNumber("Infinity")).toBeNull();
    expect(optionalNumber(null)).toBeNull();
    expect(optionalNumber(undefined)).toBeNull();
  });
});

describe("mapUrl", () => {
  it("points OpenStreetMap at the spot", () => {
    expect(mapUrl(45.4642, 9.19)).toBe(
      "https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=18/45.4642/9.19",
    );
  });
});
