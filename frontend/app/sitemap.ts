import type { MetadataRoute } from "next";

import { LAST_UPDATED } from "@/utils/changelog";
import { PUBLIC_PATHS, SITE_URL } from "@/utils/site";

// Deliberately short: listing pages that answer with a redirect to the login
// wastes crawl budget and produces nothing indexable.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly" as const,
    // The landing page is what a search result should point at, the demo page
    // next, then the changelog; the privacy notice is required to exist, not
    // to rank.
    priority: path === "/" ? 1 : path === "/demo" ? 0.6 : path === "/changelog" ? 0.5 : 0.3,
    // The changelog is the one page whose date means something: it moves with
    // every novelty, so crawlers are told when.
    ...(path === "/changelog" && { lastModified: LAST_UPDATED }),
  }));
}
