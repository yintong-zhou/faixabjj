import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// Defense in depth: the proxy (frontend/proxy.ts) already redirects
// logged-out visitors away from protected routes, but page-level checks
// don't rely solely on that — see the Supabase Next.js SSR auth guide's
// caution about trusting only cookie-based checks in the proxy.
export async function requireAdmin(path: string) {
  const supabase = createClient(await cookies());
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
}
