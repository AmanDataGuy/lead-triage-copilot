/**
 * # vitest.config.ts - unit test runner settings
 *
 * - Maps the "@/..." import alias to src/ so tests import code the same way the app does.
 * - "server-only" is replaced by an empty module so server code can be tested outside Next.js.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
