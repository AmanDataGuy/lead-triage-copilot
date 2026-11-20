/**
 * # index.ts - the one database client the server uses
 *
 * - Neon's HTTP driver: each query is one HTTPS request, so there is no connection pool to manage on serverless.
 */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
export * from "./schema";
