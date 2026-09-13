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

// Everything except the landing page sits behind a login, so there is nothing
// for a crawler to index there — and a search result pointing at a login form
// helps nobody.
export const PUBLIC_PATHS = ["/"];
