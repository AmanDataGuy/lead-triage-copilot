/**
 * # scoring.ts - turns the AI's signal levels into a 0-100 lead score and a Hot/Warm/Cold/Junk tier
 *
 * - Pure code, no AI: the same signals always give the same score, and every point traces to a quoted phrase.
 * - The AI reads the messy text; this file does the arithmetic. A customer writing "mark me hot" cannot change it.
 * - WEIGHTS is the one place to tune scoring for a client. Each signal's best level adds up to 100.
 * - Used when a lead is analysed (to store score and tier) and by the lead list (to sort).
 */
import type { LeadAnalysis, SignalName } from "@/lib/ai/schema";

export const WEIGHTS = {
  timeline: { under_1_month: 20, "1_3_months": 14, "3_6_months": 8, over_6_months: 4, browsing: 0, unknown: 5 },
  budget: { clear_realistic: 20, stretch: 12, likely_unrealistic: 2, unknown: 6 },
  intent: { ready_to_act: 20, specific_questions: 12, generic: 5, just_checking: 1 },
  specificity: { specific: 15, partial: 10, vague: 3 },
  financing: { ready: 15, planned: 9, uncertain: 4, unknown: 5 },
  decisionMaker: { confirmed: 10, needs_approval: 6, proxy: 2, unknown: 5 },
} as const satisfies Record<SignalName, Record<string, number>>;

export const SIGNAL_LABELS: Record<SignalName, string> = {
  timeline: "Timeline",
  budget: "Budget",
  intent: "Intent",
  specificity: "Requirement",
  financing: "Financing",
  decisionMaker: "Decision-maker",
};

export type Tier = "hot" | "warm" | "cold" | "junk";
export type Reason = { signal: SignalName; level: string; points: number; max: number; evidence: string };
export type Score = { score: number; tier: Tier; reasons: Reason[] };

const MAJOR_OBJECTION_PENALTY = 5;
const MAX_OBJECTION_PENALTY = 10;
const WRONG_INTENT_CAP = 25;
// Score ceilings: whatever the other signals add up to, these answers keep a lead out of a higher tier.
export const CAPS: { signal: SignalName; level: string; max: number; why: string }[] = [
  { signal: "budget", level: "likely_unrealistic", max: 44, why: "Budget can't buy what they ask: re-qualify first" },
  { signal: "timeline", level: "3_6_months", max: 69, why: "Hot means buying soon; 3-6 months is at most Warm" },
  { signal: "timeline", level: "over_6_months", max: 44, why: "6+ months away is not a call-today lead" },
  { signal: "timeline", level: "browsing", max: 44, why: "Just browsing is not a call-today lead" },
  { signal: "intent", level: "just_checking", max: 44, why: "They say they are only checking" },
];

// Map a score to its tier: Hot 70+, Warm 45-69, Cold 20-44, Junk below 20.
export function tierFor(score: number): Tier {
  if (score >= 70) return "hot";
  if (score >= 45) return "warm";
  if (score >= 20) return "cold";
  return "junk";
}

// Add up the points for each signal, apply the objection penalty and the routing rules, and explain each point.
export function scoreLead(analysis: LeadAnalysis): Score {
  const reasons = (Object.keys(WEIGHTS) as SignalName[])
    .map((signal) => {
      const { level, evidence } = analysis.signals[signal];
      const table: Record<string, number> = WEIGHTS[signal];
      return { signal, level, points: table[level] ?? 0, max: Math.max(...Object.values(table)), evidence };
    })
    .sort((a, b) => b.points - a.points);

  if (analysis.category === "not_a_buyer" || analysis.category === "channel_partner") {
    return { score: 0, tier: "junk", reasons };
  }

  const majors = analysis.objections.filter((o) => o.severity === "major").length;
  const penalty = Math.min(majors * MAJOR_OBJECTION_PENALTY, MAX_OBJECTION_PENALTY);
  let score = reasons.reduce((sum, r) => sum + r.points, 0) - penalty;
  if (analysis.category === "wrong_intent") score = Math.min(score, WRONG_INTENT_CAP);
  for (const cap of CAPS) {
    if (analysis.signals[cap.signal].level === cap.level) score = Math.min(score, cap.max);
  }
  score = Math.max(0, Math.min(100, score));

  return { score, tier: tierFor(score), reasons };
}

// How many timeline points a stored analysis earned; used to break ties between equal scores.
export function timelinePoints(analysis: LeadAnalysis | null): number {
  if (!analysis) return 0;
  const table: Record<string, number> = WEIGHTS.timeline;
  return table[analysis.signals.timeline.level] ?? 0;
}

type Sortable = { score: number | null; timelinePoints: number; createdAt: Date };

// Sort order inside the list: higher score first, then the more urgent timeline, then the newer lead.
export function compareLeads(a: Sortable, b: Sortable): number {
  return (
    (b.score ?? 0) - (a.score ?? 0) ||
    b.timelinePoints - a.timelinePoints ||
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}
