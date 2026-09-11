import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Sections gated behind admin login. The home page stays public as the
// landing page.
const PROTECTED_PREFIXES = [
  "/registro",
  "/presenze",
  "/dashboard",
  "/account",
  "/cambia-password",
];

const PASSWORD_CHANGE_PATH = "/cambia-password";

export const updateSession = async (request: NextRequest) => {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not remove or move this call. It both refreshes the
  // session cookie (via setAll above) and gives us a verified identity to
  // gate protected routes with — removing it can randomly log users out.
  const { data: claimsData } = await supabase.auth.getClaims();
  const isLoggedIn = !!claimsData?.claims;

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // An account created from the Registro starts on a shared default password,
  // so nothing else in the app opens until it has been replaced. Checked before
  // the redirects below so there is only ever one hop. Signing out stays
  // reachable — otherwise the only way out would be clearing cookies.
  const appMetadata = claimsData?.claims?.app_metadata as
    | { must_change_password?: boolean }
    | undefined;

  if (
    isLoggedIn &&
    appMetadata?.must_change_password === true &&
    pathname !== PASSWORD_CHANGE_PATH &&
    !pathname.startsWith("/auth/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = PASSWORD_CHANGE_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isProtected && !isLoggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // The landing page and the login form are both for signed-out visitors
  // only; once there is a session, neither has anything left to show.
  const VISITOR_ONLY = ["/login", "/"];

  if (isLoggedIn && VISITOR_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
};
