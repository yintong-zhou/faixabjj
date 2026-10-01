// What the scanner does with the text it reads from a QR code.
//
// The gym's QR holds `<SITE_URL>/check-in` (app/gym/page.tsx). The scanner only
// ever navigates to the app's own relative path, never to the address it read:
// a QR code is anybody's input, and following it would make the check-in button
// an open redirect. The origin is therefore ignored on purpose — the same QR
// scanned on a preview deployment or in development still checks the member in
// *there*, and a stranger's code with that path does nothing it could not do by
// typing the address.
export const CHECKIN_PATH = "/check-in";

// The path to go to, or null when the text is not a check-in code.
export function checkinPathFromQr(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // A trailing slash is the same page; anything below it is not.
  const path = url.pathname.replace(/\/+$/, "");
  return path === CHECKIN_PATH ? CHECKIN_PATH : null;
}
