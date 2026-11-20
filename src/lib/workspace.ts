/**
 * # workspace.ts - gives every browser its own private set of leads, with no login
 *
 * - proxy.ts puts a random id in the "wid" cookie on the first visit; this file reads it back.
 * - The first time a workspace is seen it is created and filled with sample leads (seed.json), whose analyses were
 *   produced earlier by this same AI pipeline. That way a reviewer sees a full ranked list instantly and browsing
 *   costs no AI quota.
 */
import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, leads, workspaces } from "@/lib/db";
import { scoreLead } from "@/lib/scoring";
import type { LeadAnalysis } from "@/lib/ai/schema";
import seed from "./seed.json";

export const WORKSPACE_COOKIE = "wid";

// Read and validate this browser's workspace id from its cookie.
export async function getWorkspaceId(): Promise<string> {
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Error("Missing workspace cookie");
  return parsed.data;
}

type SeedLead = {
  minutesAgo: number;
  lead: Omit<typeof leads.$inferInsert, "workspaceId" | "createdAt">;
  analysis: LeadAnalysis | null;
  model: string | null;
};

// Insert the sample leads into a workspace, ages offset from now so the speed-to-lead timers look live.
async function insertSeed(workspaceId: string) {
  const now = Date.now();
  const rows = (seed as SeedLead[]).map(({ minutesAgo, lead, analysis, model }) => {
    const createdAt = new Date(now - minutesAgo * 60_000);
    const scored = analysis ? scoreLead(analysis) : null;
    return {
      ...lead,
      workspaceId,
      createdAt,
      status: analysis ? ("ready" as const) : ("failed" as const),
      analysis,
      score: scored?.score ?? null,
      tier: scored?.tier ?? null,
      reasons: scored?.reasons ?? null,
      model,
      analyzedAt: analysis ? createdAt : null,
    };
  });
  if (rows.length) await db.insert(leads).values(rows);
}

// Create the workspace on first sight and give it the sample leads; does nothing for a known workspace.
export async function ensureWorkspace(workspaceId: string) {
  const created = await db.insert(workspaces).values({ id: workspaceId }).onConflictDoNothing().returning();
  if (created.length) await insertSeed(workspaceId);
}

// Wipe a workspace's leads and put the sample leads back ("Reset demo").
export async function resetWorkspace(workspaceId: string) {
  await db.delete(leads).where(eq(leads.workspaceId, workspaceId));
  await insertSeed(workspaceId);
}
