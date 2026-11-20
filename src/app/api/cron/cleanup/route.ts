/**
 * # route.ts (GET /api/cron/cleanup) - daily job that deletes old demo data
 *
 * - Called once a day by Vercel Cron (see vercel.json), which sends CRON_SECRET as a Bearer token.
 * - Deletes workspaces older than 7 days (their leads, chats and calls go with them) and old usage counters.
 * - Visitors who come back later simply get a fresh workspace with the sample leads.
 */
import { lt } from "drizzle-orm";
import { db, usage, workspaces } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

// Remove demo data past its retention window.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = Date.now();
  const deleted = await db
    .delete(workspaces)
    .where(lt(workspaces.createdAt, new Date(now - 7 * DAY_MS)))
    .returning({ id: workspaces.id });
  await db.delete(usage).where(lt(usage.day, new Date(now - 3 * DAY_MS).toISOString().slice(0, 10)));
  return Response.json({ deletedWorkspaces: deleted.length });
}
