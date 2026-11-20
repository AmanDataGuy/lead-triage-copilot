"use client";
/**
 * # lead-list.tsx - the left column: every lead, ranked, in two views
 *
 * - "Call queue": who to call next (overdue new leads, due follow-ups, fresh leads, then scheduled ones), with live
 *   speed-to-lead timers. Rules live in lib/queue.ts.
 * - "All leads": grouped Hot / Warm / Cold / Junk, sorted by score inside each group.
 * - On phones the list and a lead's detail are separate screens, so the list hides itself on a lead's page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TierBadge } from "@/components/tier-badge";
import { cn } from "@/lib/utils";
import { compareLeads, type Tier } from "@/lib/scoring";
import { orderQueue, type QueueItem } from "@/lib/queue";
import { shortDuration } from "@/lib/format";

export type ListLead = {
  id: string;
  name: string;
  location: string;
  budget: string;
  timeline: string;
  summary: string | null;
  tier: Tier | null;
  score: number | null;
  timelinePoints: number;
  status: string;
  stage: string;
  createdAt: Date;
  firstContactAt: Date | null;
  nextFollowUpAt: Date | null;
};

const GROUPS: Tier[] = ["hot", "warm", "cold", "junk"];

// Re-render every 30 seconds so the waiting timers stay current.
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// The ranked lead list with its Call queue and All leads tabs.
export function LeadList({ leads }: { leads: ListLead[] }) {
  const pathname = usePathname();
  const now = useNow();
  const queue = orderQueue(leads, now);
  const overdueHot = queue.filter((q) => q.bucket === "overdue" && q.lead.tier === "hot").length;
  const pending = leads.filter((l) => l.status !== "ready");

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full flex-col border-r md:w-[380px] md:shrink-0",
        pathname !== "/leads" && "hidden md:flex",
      )}
    >
      {overdueHot > 0 && (
        <p role="status" className="flex items-center gap-2 border-b bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
          <AlertTriangle className="size-4" aria-hidden />
          {overdueHot} hot {overdueHot === 1 ? "lead has" : "leads have"} waited over 5 minutes
        </p>
      )}
      <Tabs defaultValue="queue" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-4 my-3 grid w-auto grid-cols-2">
          <TabsTrigger value="queue">Call queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="all">All leads ({leads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="min-h-0 flex-1 overflow-y-auto">
          {queue.length === 0 && <Empty text="Nobody to call right now." />}
          <ul>
            {queue.map((item) => (
              <LeadRow key={item.lead.id} lead={item.lead} active={pathname === `/leads/${item.lead.id}`}>
                <QueueBadge item={item} now={now} />
              </LeadRow>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="all" className="min-h-0 flex-1 overflow-y-auto">
          {pending.length > 0 && (
            <Group title="Needs attention" count={pending.length}>
              {pending.map((l) => (
                <LeadRow key={l.id} lead={l} active={pathname === `/leads/${l.id}`} />
              ))}
            </Group>
          )}
          {GROUPS.map((tier) => {
            const group = leads.filter((l) => l.status === "ready" && l.tier === tier).sort(compareLeads);
            if (!group.length) return null;
            return (
              <Group key={tier} title={tier} count={group.length} collapsed={tier === "junk"}>
                {group.map((l) => (
                  <LeadRow key={l.id} lead={l} active={pathname === `/leads/${l.id}`} />
                ))}
              </Group>
            );
          })}
          {leads.length === 0 && <Empty text='No leads yet. Add one, or use "Reset demo" for sample leads.' />}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

// A titled, optionally collapsed section of the All leads view.
function Group({ title, count, collapsed, children }: { title: string; count: number; collapsed?: boolean; children: React.ReactNode }) {
  return (
    <details open={!collapsed} className="group">
      <summary className="cursor-pointer bg-muted/50 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title} ({count})
      </summary>
      <ul>{children}</ul>
    </details>
  );
}

// One lead in the list: tier, name, age, one-line summary, and the key facts.
function LeadRow({ lead, active, children }: { lead: ListLead; active: boolean; children?: React.ReactNode }) {
  return (
    <li>
      <Link
        href={`/leads/${lead.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "block border-b px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted",
          active && "bg-muted",
        )}
      >
        <div className="flex items-center gap-2">
          {lead.status === "ready" && lead.tier ? (
            <TierBadge tier={lead.tier} score={lead.score} />
          ) : lead.status === "analyzing" ? (
            <Badge variant="outline">
              <Loader2 className="animate-spin" aria-hidden /> Analysing
            </Badge>
          ) : (
            <Badge variant="destructive">Analysis failed</Badge>
          )}
          <span className="truncate font-medium">{lead.name}</span>
          <span className="ml-auto shrink-0">{children}</span>
        </div>
        {lead.summary && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{lead.summary}</p>}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {lead.budget} · {lead.timeline} · {lead.location}
        </p>
      </Link>
    </li>
  );
}

// Why a lead is where it is in the call queue: waiting time, follow-up due, or scheduled.
function QueueBadge({ item, now }: { item: QueueItem<ListLead>; now: Date }) {
  const { bucket, sla, lead } = item;
  if (bucket === "overdue" && sla) {
    return (
      <Badge className={lead.tier === "cold" ? "bg-muted text-muted-foreground" : "bg-red-600 text-white"}>
        <Clock aria-hidden /> waiting {shortDuration(sla.waitingMs)}
      </Badge>
    );
  }
  if (bucket === "new" && sla) {
    return <span className="text-xs text-muted-foreground">new · {shortDuration(sla.waitingMs)}</span>;
  }
  if (bucket === "follow_up_due") return <Badge variant="secondary">Follow-up due</Badge>;
  const inMs = (lead.nextFollowUpAt?.getTime() ?? now.getTime()) - now.getTime();
  return <span className="text-xs text-muted-foreground">next call in {shortDuration(inMs)}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
