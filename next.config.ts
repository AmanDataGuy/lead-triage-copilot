/**
 * # next.config.ts - Next.js build and response settings
 *
 * - Cache Components stay off: every page shows one visitor's own leads, so there is nothing to cache.
 * - Adds basic security headers to every response.
 * - Forwards /api/* to the Python API (API_URL), so the browser never needs a second origin.
 */
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The browser calls the Python API on the same origin (so the workspace cookie just works); Next forwards it.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://127.0.0.1:8000"}/api/:path*` }];
  },
};

export default nextConfig;
