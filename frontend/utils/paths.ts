// A route prefix covers the path itself and the paths below it, never a
// longer segment: `/gym` (a manager's gym page) must not match `/gyms` (the
// superadmin's list), which a bare startsWith would.
export function underPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Where to send somebody after a form that carries a `next` destination
// (login, the language switcher). Only a path on this site is honoured: a full
// URL, a protocol-relative `//host`, or `/\host` — which browsers read as
// `//host` — would turn the form into a redirect to anywhere, and after a real
// sign-in that is a ready-made phishing page. Parsed against a placeholder
// origin rather than pattern-matched, so whatever the URL parser would take
// for another host is refused, whatever the spelling.
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  const base = "http://same.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  // Backslashes and control characters are refused outright: the URL parser
  // silently drops tabs and newlines, so what it saw is not what was typed.
  if (url.origin !== base || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
