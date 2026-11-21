/**
 * # types.ts - the shapes of the JSON the Python API returns (mirrors backend/app/schemas.py and db.py)
 *
 * - Display-only: the API validates everything and owns all business rules; the UI just shows the results.
 */

export type Tier = "hot" | "warm" | "cold" | "junk";

type Signal = { level: string; evidence: string };

export type LeadAnalysis = {
  category: "buyer" | "wrong_intent" | "channel_partner" | "not_a_buyer";
  inputQuality: "ok" | "thin";
  summary: string;
  intent: { type: string; explanation: string };
  keyRequirements: string[];
  objections: { concern: string; severity: "minor" | "major"; handling: string }[];
  contradictions: string[];
  missingInfo: string[];
  signals: Record<"timeline" | "budget" | "intent" | "specificity" | "financing" | "decisionMaker", Signal>;
  nextAction: {
    action: "call_now" | "book_site_visit" | "send_details" | "clarify_budget" | "nurture" | "reroute" | "disqualify";
    when: "now" | "today" | "this_week" | "later";
    detail: string;
  };
  callBrief: { opener: string; emphasize: string[]; objectionReply: string };
  suggestedResponse: string;
  language: string;
};

export type Reason = { signal: string; level: string; points: number; max: number; evidence: string };

export type Lead = {
  id: string;
  name: string;
  phone: string;
  location: string;
  requirement: string;
  budget: string;
  timeline: string;
  message: string;
  callNotes: string;
  status: "analyzing" | "ready" | "failed";
  analysis: LeadAnalysis | null;
  score: number | null;
  tier: Tier | null;
  reasons: Reason[] | null;
  model: string | null;
  stage: string;
};

type SignalChange = { signal: string; from: string; to: string; evidence: string };

export type Activity = {
  id: string;
  outcome: string;
  note: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  changes: SignalChange[];
  createdAt: string;
};

export type ListLead = {
  id: string;
  name: string;
  location: string;
  budget: string;
  timeline: string;
  summary: string | null;
  tier: Tier | null;
  score: number | null;
  status: string;
  stage: string;
  createdAt: string;
  firstContactAt: string | null;
  nextFollowUpAt: string | null;
};

export type QueueEntry = { id: string; bucket: "overdue" | "follow_up_due" | "new" | "scheduled"; slaMinutes: number | null };

// Plain names for the six scoring signals, keyed the way the API names them.
export const SIGNAL_LABELS: Record<string, string> = {
  timeline: "Timeline",
  budget: "Budget",
  intent: "Intent",
  specificity: "Requirement",
  financing: "Financing",
  decision_maker: "Decision-maker",
};
