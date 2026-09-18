// One place for the facts about the site that metadata, the sitemap, robots.txt
// and the structured data all have to agree on.
//
// The URL has to be absolute for Open Graph, canonical links and the sitemap:
// a relative one is silently ignored by crawlers. It comes from the
// environment because it differs between a preview deployment and production,
// and falls back to localhost so a local build still produces valid absolute
// URLs rather than throwing.
export const SITE_NAME = "FAIXABJJ";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// The only two pages a crawler can reach: everything else sits behind a login,
// and a search result pointing at a login form helps nobody. The privacy
// notice belongs here because it has to be readable before signing up — a
// legal notice behind a login is not a notice.
export const PUBLIC_PATHS = ["/", "/privacy"];
