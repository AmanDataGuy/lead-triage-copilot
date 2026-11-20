/**
 * # queue.ts - the Call Loop's business rules: who to call next, speed-to-lead timers, what a call changed
 *
 * - Pure functions, no AI and no I/O, so every rule is exact and unit-tested.
 * - Speed-to-lead: a new Hot lead should get a call within 5 minutes, Warm within an hour, Cold within a day.
 * - Used by the Call queue tab, the lead list badges and the log-call action.
 */
import type { LeadAnalysis } from "@/lib/ai/schema";
import type { SignalChange } from "@/lib/db/schema";
import type { Tier } from "@/lib/scoring";
import { SIGNAL_LABELS } from "@/lib/scoring";
import type { SignalName } from "@/lib/ai/schema";

const MIN = 60_000;
export const SLA_MS: Record<Tier, number | null> = { hot: 5 * MIN, warm: 60 * MIN, cold: 24 * 60 * MIN, junk: null };

type QueueLead = {
  id: string;
  tier: Tier | null;
  score: number | null;
  status: string;
  stage: string;
  createdAt: Date;
  firstContactAt: Date | null;
  nextFollowUpAt: Date | null;
};

export type Sla = { waitingMs: number; limitMs: number; overdue: boolean };

// How long an uncontacted lead has waited against its tier's target; null once contacted or for junk.
export function slaStatus(lead: QueueLead, now: Date): Sla | null {
  const limitMs = lead.tier ? SLA_MS[lead.tier] : null;
  if (lead.firstContactAt || limitMs === null || lead.status !== "ready") return null;
  const waitingMs = now.getTime() - lead.createdAt.getTime();
  return { waitingMs, limitMs, overdue: waitingMs > limitMs };
}

export type QueueItem<T> = { lead: T; bucket: "overdue" | "follow_up_due" | "new" | "scheduled"; sla: Sla | null };

const BUCKET_ORDER = { overdue: 0, follow_up_due: 1, new: 2, scheduled: 3 } as const;

// Order the day's calls: overdue new leads first, then follow-ups that are due, then other new leads, then the rest.
export function orderQueue<T extends QueueLead>(leads: T[], now: Date): QueueItem<T>[] {
  return leads
    .filter((l) => l.status === "ready" && l.tier !== "junk" && l.stage !== "closed_lost")
    .map((lead): QueueItem<T> => {
      const sla = slaStatus(lead, now);
      if (sla) return { lead, sla, bucket: sla.overdue ? "overdue" : "new" };
      const due = lead.nextFollowUpAt && lead.nextFollowUpAt <= now;
      return { lead, sla, bucket: due ? "follow_up_due" : "scheduled" };
    })
    .sort((a, b) => {
      const byBucket = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
      if (byBucket) return byBucket;
      if (a.bucket === "follow_up_due" || a.bucket === "scheduled") {
        const at = (x: QueueItem<T>) => x.lead.nextFollowUpAt?.getTime() ?? Infinity;
        return at(a) - at(b);
      }
      return (b.lead.score ?? 0) - (a.lead.score ?? 0) || a.lead.createdAt.getTime() - b.lead.createdAt.getTime();
    });
}

const FOLLOW_UP_MS: Record<LeadAnalysis["nextAction"]["when"], number> = {
  now: 60 * MIN,
  today: 4 * 60 * MIN,
  this_week: 3 * 24 * 60 * MIN,
  later: 14 * 24 * 60 * MIN,
};
export const NO_ANSWER_RETRY_MS = 2 * 60 * MIN;

// When to follow up next, from the AI's suggested timing.
export function followUpAt(when: LeadAnalysis["nextAction"]["when"], now: Date): Date {
  return new Date(now.getTime() + FOLLOW_UP_MS[when]);
}

// List the signals whose level changed between two analyses, with the new evidence; computed in code, not by the AI.
export function diffSignals(before: LeadAnalysis | null, after: LeadAnalysis): SignalChange[] {
  if (!before) return [];
  return (Object.keys(after.signals) as SignalName[])
    .filter((s) => before.signals[s].level !== after.signals[s].level)
    .map((s) => ({
      signal: SIGNAL_LABELS[s],
      from: before.signals[s].level,
      to: after.signals[s].level,
      evidence: after.signals[s].evidence,
    }));
}
