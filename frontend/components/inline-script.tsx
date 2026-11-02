"use client";

/**
 * An inline script that React does not warn about.
 *
 * A Client Component on purpose, as in the guide. Left as a Server Component
 * (the root layout is one) it only ever ran on the server, so the RSC payload
 * always said `text/javascript`, and React warned whenever it built the tag in
 * the browser instead of hydrating it.
 *
 * React warns in development whenever a render produces a `<script>` tag. The
 * documented way around it (Next's "Preventing flash before hydration" guide)
 * is to give the element a type the browser executes on the server pass and
 * ignores on the client pass: the HTML sent to the browser carries
 * `text/javascript` and runs during parsing, while React's own render produces
 * `text/plain`, which is inert.
 *
 * `suppressHydrationWarning` covers the resulting `type` mismatch — it is
 * expected, not a bug.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
