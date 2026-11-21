"use client";
/**
 * # lead-list.tsx - the left column: every lead, ranked, in two views
 *
 * - "Call queue": who to call next, in the order the API's Call Loop rules decided, with live speed-to-lead timers.
 * - "All leads": grouped Hot / Warm / Cold / Junk; the API already sorts them by score.
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
import { shortDuration } from "@/lib/format";
import type { ListLead, QueueEntry, Tier } from "@/lib/types";

const GROUPS: Tier[] = ["hot", "warm", "cold", "junk"];

// Re-render every 30 seconds so the waiting timers stay current.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// The ranked lead list with its Call queue and All leads tabs.
export function LeadList({ leads, queue }: { leads: ListLead[]; queue: QueueEntry[] }) {
  const pathname = usePathname();
  const now = useNow();
  const byId = new Map(leads.map((l) => [l.id, l]));
  const waitingMs = (l: ListLead) => now - new Date(l.createdAt).getTime();
  const isOverdue = (q: QueueEntry, l: ListLead) => q.slaMinutes !== null && waitingMs(l) > q.slaMinutes * 60_000;
  const overdueHot = queue.filter((q) => byId.get(q.id)?.tier === "hot" && isOverdue(q, byId.get(q.id)!)).length;
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
            {queue.map((q) => {
              const lead = byId.get(q.id);
              if (!lead) return null;
              return (
                <LeadRow key={q.id} lead={lead} active={pathname === `/leads/${q.id}`}>
                  <QueueBadge entry={q} lead={lead} overdue={isOverdue(q, lead)} waitingMs={waitingMs(lead)} now={now} />
                </LeadRow>
              );
            })}
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
            const group = leads.filter((l) => l.status === "ready" && l.tier === tier);
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
function Group({
  title,
  count,
  collapsed,
  children,
}: {
  title: string;
  count: number;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={!collapsed}>
      <summary className="cursor-pointer bg-muted/50 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title} ({count})
      </summary>
      <ul>{children}</ul>
    </details>
  );
}

// One lead in the list: tier, name, one-line summary, and the key facts.
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
function QueueBadge({
  entry,
  lead,
  overdue,
  waitingMs,
  now,
}: {
  entry: QueueEntry;
  lead: ListLead;
  overdue: boolean;
  waitingMs: number;
  now: number;
}) {
  if (entry.slaMinutes !== null && overdue) {
    return (
      <Badge className={lead.tier === "cold" ? "bg-muted text-muted-foreground" : "bg-red-600 text-white"}>
        <Clock aria-hidden /> waiting {shortDuration(waitingMs)}
      </Badge>
    );
  }
  if (entry.slaMinutes !== null) {
    return <span className="text-xs text-muted-foreground">new · {shortDuration(waitingMs)}</span>;
  }
  if (entry.bucket === "follow_up_due") return <Badge variant="secondary">Follow-up due</Badge>;
  const inMs = (lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : now) - now;
  return <span className="text-xs text-muted-foreground">next call in {shortDuration(inMs)}</span>;
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
