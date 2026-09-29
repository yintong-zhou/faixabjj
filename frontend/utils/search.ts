// Folds a search term the way member_overview.search_name folds a name
// (lower(unaccent(full_name)), 20260929000000), so "jose" finds "José" and
// "JOÃO" finds "Joao".
//
// Unicode decomposition strips the combining marks (é → e, ã → a, ç → c).
// The few letters that are not a base letter plus a mark are mapped by hand to
// what unaccent gives them; without it a term typed as "Søren" would find
// nothing, because the column already reads "soren".
const LETTERS: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (letter) => LETTERS[letter]);
}

// The words of a Registro search, each of which must appear somewhere in the
// name. The strip keeps a stray comma or parenthesis from breaking PostgREST's
// filter syntax (`_` too: it is ilike's one-character wildcard). At most five,
// so a pasted paragraph does not become a query of fifty filters.
export function searchWords(query: string): string[] {
  return foldForSearch(query)
    .replace(/[%,()\\_*]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}
