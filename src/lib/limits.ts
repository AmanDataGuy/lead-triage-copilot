/**
 * # limits.ts - daily caps on AI calls, so one visitor (or a bot) cannot burn the free quota for everyone
 *
 * - Three counters per day: this IP (hashed, never stored raw), this workspace, and the whole site.
 * - One SQL statement bumps all three and returns the new counts.
 * - The site-wide cap sits below Gemini's free daily quota, so the demo degrades politely instead of failing.
 */
import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db, usage } from "@/lib/db";

export const DAILY_LIMITS = { ip: 40, workspace: 40, global: 350 } as const;

export class QuotaError extends Error {}

// The visitor's IP as Vercel reports it, hashed so the database never holds a raw address.
async function ipKey(): Promise<string> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

// Count one AI call against today's caps; throws QuotaError if any cap is now exceeded.
export async function consumeAiCall(workspaceId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const keys = [
    { key: await ipKey(), limit: DAILY_LIMITS.ip },
    { key: `ws:${workspaceId}`, limit: DAILY_LIMITS.workspace },
    { key: "global", limit: DAILY_LIMITS.global },
  ];
  const counts = await db
    .insert(usage)
    .values(keys.map(({ key }) => ({ day, key, count: 1 })))
    .onConflictDoUpdate({ target: [usage.day, usage.key], set: { count: sql`${usage.count} + 1` } })
    .returning({ key: usage.key, count: usage.count });

  for (const { key, limit } of keys) {
    if ((counts.find((c) => c.key === key)?.count ?? 0) > limit) {
      throw new QuotaError("Today's free AI quota for this demo is used up. Please try again tomorrow.");
    }
  }
}
