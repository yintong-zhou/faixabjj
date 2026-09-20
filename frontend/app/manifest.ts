import type { MetadataRoute } from "next";

import { SITE_NAME } from "@/utils/site";

// What a browser reads when somebody adds the app to their home screen.
//
// Deliberately static, and in the default language. A manifest is fetched
// without the session's cookies in several browsers, so reading the locale
// cookie here would produce the default language most of the time anyway,
// while turning this cached route into a dynamic one. The name is the brand,
// which is never translated; the words around it are English, which is what
// DEFAULT_LOCALE is.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: "Hours, stripes and belts for a Brazilian Jiu-Jitsu school.",
    // "/" and not "/dashboard": the proxy already sends a signed-in visitor to
    // the dashboard and a signed-out one to the landing page, so one entry
    // point is right for both and the icon does not open a login redirect.
    start_url: "/",
    display: "standalone",
    // The light surface, matching the light half of the viewport themeColor in
    // app/layout.tsx. The splash screen is painted before any stylesheet runs,
    // so it cannot follow the user's theme.
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android crops an icon to the platform's own shape. A maskable one is
      // drawn with the artwork inside the 80% safe zone, so the corners it cuts
      // off are background rather than belt.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
