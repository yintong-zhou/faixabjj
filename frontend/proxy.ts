import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/proxy";

// Next.js renamed the "middleware" file convention to "proxy" — see
// https://nextjs.org/docs/messages/middleware-to-proxy
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// robots.txt and sitemap.xml are excluded along with the static assets: they
// are public by definition, and refreshing an auth session for an anonymous
// crawler is a Supabase round trip that buys nothing.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
