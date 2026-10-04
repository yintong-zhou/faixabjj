import { describe, expect, it } from "vitest";

import { mailtoHref } from "./mailto";

describe("mailtoHref", () => {
  it("encodes subject and body, joining lines with CRLF", () => {
    expect(mailtoHref("a@b.it", "Demo & prova?", ["Ciao,", "palestra: [nome]"])).toBe(
      "mailto:a@b.it?subject=Demo%20%26%20prova%3F&body=Ciao%2C%0D%0Apalestra%3A%20%5Bnome%5D",
    );
  });

  it("keeps accented letters intact once decoded", () => {
    const href = mailtoHref("a@b.it", "Città", ["Graduação"]);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe("Città");
    expect(params.get("body")).toBe("Graduação");
  });
});
