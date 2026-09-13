// Who counts as a member of the gym, as opposed to somebody who merely runs
// the portal.
//
// `admin` exists for whoever administers FAIXABJJ without teaching, so such an
// account must not appear in the Registro list, in a roll call, or in any
// other place the app asks "which of our people is this". It stays selectable
// only where an admin account is actually being created.

export const PORTAL_ONLY_ROLE = "admin";

// The PostgREST value for "active_roles is exactly {admin}". The test is array
// *equality*, not "contains admin": somebody who is both maestro and admin
// still trains here and must stay visible. `member_overview.active_roles` is
// coalesced to an empty array and sorted, so this matches exactly the
// admin-only case and never a person with no roles at all.
//
// Use it as: query.not("active_roles", "eq", PORTAL_ONLY_ROLES)
export const PORTAL_ONLY_ROLES = `{${PORTAL_ONLY_ROLE}}`;

// The roles that can lead a class. `admin` is absent for the reason above; an
// admin who does teach holds a technical role as well and appears through it.
export const TECHNICAL_ROLES = ["instructor", "head_coach"];
