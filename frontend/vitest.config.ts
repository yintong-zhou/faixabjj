import { defineConfig } from "vitest/config";

// Pure functions only — no jsdom, no component tests. Anything that needs a
// browser or a database is verified by running the app, not here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["utils/**/*.test.ts"],
  },
});
