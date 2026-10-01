import { describe, expect, it } from "vitest";

import { checkinPathFromQr } from "./checkin-qr";

describe("checkinPathFromQr", () => {
  it("accepts the address printed on the gym's QR", () => {
    expect(checkinPathFromQr("https://faixabjj.vercel.app/check-in")).toBe("/check-in");
  });

  it("accepts a trailing slash and surrounding whitespace", () => {
    expect(checkinPathFromQr("https://faixabjj.vercel.app/check-in/")).toBe("/check-in");
    expect(checkinPathFromQr("  https://faixabjj.vercel.app/check-in \n")).toBe("/check-in");
  });

  // The origin is ignored on purpose: the scanner navigates to its own path,
  // so a code from another host cannot take anybody anywhere.
  it("returns the app's own path whatever the host", () => {
    expect(checkinPathFromQr("http://localhost:3000/check-in")).toBe("/check-in");
    expect(checkinPathFromQr("https://elsewhere.example/check-in")).toBe("/check-in");
  });

  it("ignores a query string and a fragment", () => {
    expect(checkinPathFromQr("https://faixabjj.vercel.app/check-in?x=1#y")).toBe("/check-in");
  });

  it("rejects other pages of the site", () => {
    expect(checkinPathFromQr("https://faixabjj.vercel.app/attendance")).toBeNull();
    expect(checkinPathFromQr("https://faixabjj.vercel.app/check-in/extra")).toBeNull();
    expect(checkinPathFromQr("https://faixabjj.vercel.app/")).toBeNull();
  });

  it("rejects text that is not an address", () => {
    expect(checkinPathFromQr("")).toBeNull();
    expect(checkinPathFromQr("check-in")).toBeNull();
    expect(checkinPathFromQr("/check-in")).toBeNull();
  });

  it("rejects schemes that are not web addresses", () => {
    expect(checkinPathFromQr("javascript:alert(1)//check-in")).toBeNull();
    expect(checkinPathFromQr("mailto:someone@example.com")).toBeNull();
  });
});
