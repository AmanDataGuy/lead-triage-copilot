/**
 * # vitest.evals.config.ts - settings for the AI quality evals (`npm run eval`)
 *
 * - Same import setup as the unit tests, but runs evals/*.eval.ts against the REAL AI, so it needs the keys in .env
 *   and uses free-tier quota. Not part of `npm test` or CI for that reason.
 * - Files run one at a time with long timeouts, to stay inside free-tier rate limits.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import { loadEnv } from "vite";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["evals/**/*.eval.ts"],
      env: loadEnv("test", process.cwd(), ""),
      testTimeout: 90_000,
      fileParallelism: false,
    },
  }),
);
