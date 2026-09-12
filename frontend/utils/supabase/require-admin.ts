import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export const PASSWORD_CHANGE_PATH = "/cambia-password";

export type AdminSession = {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  mustChangePassword: boolean;
};

// Mirrors the SQL predicates of the same names. Roles map onto them like this:
//   student / assistant — none of the four
//   instructor         — canViewRegistry (read-only on the registry) and
//                        canManageClasses (full write on courses and attendance)
//   head_coach / admin — all four
//
// canManageClasses is deliberately not canEditRegistry: an instructor runs the
// classes but must never change anybody's belt.
export type Access = {
  canViewRegistry: boolean;
  canEditRegistry: boolean;
  canManageUsers: boolean;
  canManageClasses: boolean;
};

const NO_ACCESS: Access = {
  canViewRegistry: false,
  canEditRegistry: false,
  canManageUsers: false,
  canManageClasses: false,
};

export type AdminSessionWithAccess = AdminSession & { access: Access };

// Only requires a session — it does *not* enforce the pending password change.
// The change-password page itself uses this; everything else uses requireAdmin,
// which would bounce that page back to itself forever.
export async function requireSession(path: string): Promise<AdminSession> {
  const supabase = createClient(await cookies());
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  // `app_metadata` rides in the verified JWT and is writable only by the
  // service role — unlike `user_metadata`, which the user can edit themselves
  // and could therefore use to clear their own obligation.
  const appMetadata = claims.app_metadata as
    | { must_change_password?: boolean }
    | undefined;

  return {
    supabase,
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
    mustChangePassword: appMetadata?.must_change_password === true,
  };
}

// Defense in depth: the proxy (frontend/proxy.ts) already redirects
// logged-out visitors away from protected routes, but page-level checks
// don't rely solely on that — see the Supabase Next.js SSR auth guide's
// caution about trusting only cookie-based checks in the proxy. The same
// reasoning applies to the pending password change.
export async function requireAdmin(path: string): Promise<AdminSession> {
  const session = await requireSession(path);

  if (session.mustChangePassword) {
    redirect(PASSWORD_CHANGE_PATH);
  }

  return session;
}

// Asking the database rather than recomputing the rules here keeps a single
// definition of each privilege. One RPC returns all three flags.
// Fails closed: an error means no access, never full access.
export async function getAccess(supabase: SupabaseClient): Promise<Access> {
  const { data, error } = await supabase.rpc("current_access");

  if (error || !data) {
    return NO_ACCESS;
  }

  return {
    canViewRegistry: data.canViewRegistry === true,
    canEditRegistry: data.canEditRegistry === true,
    canManageUsers: data.canManageUsers === true,
    canManageClasses: data.canManageClasses === true,
  };
}

export async function canManageUsers(supabase: SupabaseClient): Promise<boolean> {
  return (await getAccess(supabase)).canManageUsers;
}

// Registro and Presenze. Answers 404 rather than 403 on purpose: an allievo
// has no business learning that the staff sections exist.
export async function requireRegistryViewer(
  path: string,
): Promise<AdminSessionWithAccess> {
  const session = await requireAdmin(path);
  const access = await getAccess(session.supabase);

  if (!access.canViewRegistry) {
    notFound();
  }

  return { ...session, access };
}

// Writing to the registry (adding or editing a member). Today this is the same
// set of people as requireUserManager — head_coach and admin — but they are
// separate predicates on purpose, so keep using the one that names the action.
export async function requireRegistryEditor(
  path: string,
): Promise<AdminSessionWithAccess> {
  const session = await requireAdmin(path);
  const access = await getAccess(session.supabase);

  if (!access.canEditRegistry) {
    notFound();
  }

  return { ...session, access };
}

// Courses, sessions and attendance. Instructors are included here but not in
// requireRegistryEditor — they run the classes, they do not promote anyone.
export async function requireClassManager(
  path: string,
): Promise<AdminSessionWithAccess> {
  const session = await requireAdmin(path);
  const access = await getAccess(session.supabase);

  if (!access.canManageClasses) {
    notFound();
  }

  return { ...session, access };
}

// User management. Same 404-not-403 reasoning.
export async function requireUserManager(path: string): Promise<AdminSessionWithAccess> {
  const session = await requireAdmin(path);
  const access = await getAccess(session.supabase);

  if (!access.canManageUsers) {
    notFound();
  }

  return { ...session, access };
}
