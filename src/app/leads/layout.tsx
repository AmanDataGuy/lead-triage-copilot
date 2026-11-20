/**
 * # layout.tsx (/leads) - the app frame: header, ranked lead list on the left, the open lead on the right
 *
 * - Asks the API for this visitor's leads (the API creates and seeds the workspace on the first visit) and for
 *   the call queue order, which the API works out with its Call Loop rules.
 */
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeSheet } from "@/components/intake-sheet";
import { LeadList } from "@/components/lead-list";
import { api } from "@/lib/api";
import type { ListLead, QueueEntry } from "@/lib/types";
import { resetDemo } from "@/app/actions";

// Render the header and the lead list around whichever lead is open.
export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const res = await api<{ leads: ListLead[]; queue: QueueEntry[] }>("/api/leads");
  if (!res.ok) throw new Error("The lead service is unavailable. Please refresh in a moment.");

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
          <Button variant="ghost" size="sm" type="submit" aria-label="Reset demo">
            <RotateCcw aria-hidden /> <span className="hidden sm:inline">Reset demo</span>
          </Button>
        </form>
        <IntakeSheet />
      </header>
      <div className="flex min-h-0 flex-1">
        <LeadList leads={res.data.leads} queue={res.data.queue} />
        {children}
      </div>
    </div>
  );
}
