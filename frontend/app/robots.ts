import type { MetadataRoute } from "next";

import { SITE_URL } from "@/utils/site";

// Only the landing page is public; everything else is behind a login and a
// crawler would get the login form, not the content. Saying so explicitly
// keeps those URLs out of search results instead of relying on the redirect.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/forgot-password",
        "/reset-password",
        "/cambia-password",
        "/dashboard",
        "/registro",
        "/presenze",
        "/corsi",
        "/account",
        "/auth/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
