/**
 * # helpers.ts - builds a valid LeadAnalysis for tests, with any field overridden
 */
import type { LeadAnalysis } from "@/lib/ai/schema";

type Levels = { [K in keyof LeadAnalysis["signals"]]?: LeadAnalysis["signals"][K]["level"] };

// A complete, valid analysis; pass signal levels or top-level fields to change what a test needs.
export function makeAnalysis(levels: Levels = {}, overrides: Partial<LeadAnalysis> = {}): LeadAnalysis {
  const s = (level: string) => ({ level, evidence: `quote for ${level}` });
  return {
    category: "buyer",
    inputQuality: "ok",
    summary: "Wants a 2BHK in Whitefield soon.",
    intent: { type: "self_use", explanation: "Buying a home to live in." },
    keyRequirements: ["2BHK", "Whitefield"],
    objections: [],
    contradictions: [],
    missingInfo: [],
    signals: {
      timeline: s(levels.timeline ?? "unknown"),
      budget: s(levels.budget ?? "unknown"),
      intent: s(levels.intent ?? "generic"),
      specificity: s(levels.specificity ?? "partial"),
      financing: s(levels.financing ?? "unknown"),
      decisionMaker: s(levels.decisionMaker ?? "unknown"),
    } as LeadAnalysis["signals"],
    nextAction: { action: "call_now", when: "now", detail: "Call and confirm the site visit." },
    callBrief: { opener: "Hi!", emphasize: ["Ready to move"], objectionReply: "We can check that." },
    suggestedResponse: "Hello, thanks for reaching out.",
    language: "english",
    ...overrides,
  };
}
