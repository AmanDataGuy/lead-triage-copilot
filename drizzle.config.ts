/**
 * # drizzle.config.ts - settings for drizzle-kit, which turns src/lib/db/schema.ts into SQL migrations
 *
 * - `npm run db:generate` writes a migration into drizzle/; `npm run db:migrate` applies it to DATABASE_URL.
 */
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
