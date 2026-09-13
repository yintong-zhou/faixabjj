import type { MetadataRoute } from "next";

import { PUBLIC_PATHS, SITE_URL } from "@/utils/site";

// Deliberately short: listing pages that answer with a redirect to the login
// wastes crawl budget and produces nothing indexable.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly" as const,
    priority: 1,
  }));
}
