import { describe, expect, it } from "vitest";
import { foldForSearch, searchWords } from "./search";

describe("foldForSearch", () => {
  it("drops accents and case", () => {
    expect(foldForSearch("José")).toBe("jose");
    expect(foldForSearch("JOÃO Gonçalves")).toBe("joao goncalves");
    expect(foldForSearch("Nicolò Müller")).toBe("nicolo muller");
  });

  it("maps letters that do not decompose", () => {
    expect(foldForSearch("Søren Æbelø")).toBe("soren aebelo");
    expect(foldForSearch("Straße Łukasz")).toBe("strasse lukasz");
  });

  it("leaves plain text alone", () => {
    expect(foldForSearch("mario rossi")).toBe("mario rossi");
  });
});

describe("searchWords", () => {
  it("splits on whitespace and folds each word", () => {
    expect(searchWords("  Rossi   José ")).toEqual(["rossi", "jose"]);
  });

  it("strips PostgREST and ilike syntax", () => {
    expect(searchWords("a,b(c)%d")).toEqual(["a", "b", "c", "d"]);
    expect(searchWords("x_y\\z*w")).toEqual(["x", "y", "z", "w"]);
  });

  it("keeps at most five words", () => {
    expect(searchWords("a b c d e f g")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns nothing for an empty term", () => {
    expect(searchWords("")).toEqual([]);
    expect(searchWords(" , ")).toEqual([]);
  });
});
