/**
 * # layout.tsx (/leads) - the app frame: header, ranked lead list on the left, the open lead on the right
 *
 * - First visit: creates this browser's workspace and fills it with the sample leads.
 * - Loads only the fields the list needs; the open lead's page loads the rest.
 */
import { desc, eq } from "drizzle-orm";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeSheet } from "@/components/intake-sheet";
import { LeadList, type ListLead } from "@/components/lead-list";
import { db, leads } from "@/lib/db";
import { timelinePoints } from "@/lib/scoring";
import { ensureWorkspace, getWorkspaceId } from "@/lib/workspace";
import { resetDemo } from "@/app/actions";

// Render the header and the lead list around whichever lead is open.
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const workspaceId = await getWorkspaceId();
  await ensureWorkspace(workspaceId);
  const rows = await db.select().from(leads).where(eq(leads.workspaceId, workspaceId)).orderBy(desc(leads.createdAt));

  const list: ListLead[] = rows.map((l) => ({
    id: l.id,
    name: l.name,
    location: l.location,
    budget: l.budget,
    timeline: l.timeline,
    summary: l.analysis?.summary ?? null,
    tier: l.tier,
    score: l.score,
    timelinePoints: timelinePoints(l.analysis),
    status: l.status,
    stage: l.stage,
    createdAt: l.createdAt,
    firstContactAt: l.firstContactAt,
    nextFollowUpAt: l.nextFollowUpAt,
  }));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="font-semibold">LeadPilot</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Public demo: use made-up data. Your leads are private to this browser and deleted after 7 days.
          </p>
        </div>
        <form action={resetDemo} className="ml-auto">
          <Button variant="ghost" size="sm" type="submit">
            <RotateCcw aria-hidden /> <span className="hidden sm:inline">Reset demo</span>
          </Button>
        </form>
        <IntakeSheet />
      </header>
      <div className="flex min-h-0 flex-1">
        <LeadList leads={list} />
        {children}
      </div>
    </div>
  );
}
