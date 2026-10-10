import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pure functions only — no jsdom, no component tests. Anything that needs a
// browser or a database is verified by running the app, not here. The alias
// mirrors tsconfig's, for the few server modules tested with their
// dependencies mocked (utils/notify-flow.test.ts).
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    environment: "node",
    include: ["utils/**/*.test.ts"],
  },
});
