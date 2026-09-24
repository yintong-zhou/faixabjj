// A route prefix covers the path itself and the paths below it, never a
// longer segment: `/gym` (a manager's gym page) must not match `/gyms` (the
// superadmin's list), which a bare startsWith would.
export function underPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
