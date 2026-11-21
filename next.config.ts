/**
 * # next.config.ts - Next.js build and response settings
 *
 * - Cache Components stay off: every page shows one visitor's own leads, so there is nothing to cache.
 * - Adds basic security headers to every response.
 * - Locally forwards /api/* to the Python API, so the browser never needs a second origin.
 */
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
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
  // Locally, forward /api/* to the Python dev server so the browser stays on one origin. On Vercel, the project's
  // Services routing already sends /api/* to the FastAPI service, so no rewrite is needed there.
  async rewrites() {
    if (process.env.VERCEL) return [];
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },
};

export default nextConfig;
