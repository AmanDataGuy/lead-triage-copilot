/**
 * # scoring.test.ts - pins the lead-scoring rules so a weight change is always a deliberate one
 */
import { describe, expect, it } from "vitest";
import { scoreLead, tierFor, compareLeads, WEIGHTS } from "@/lib/scoring";
import { makeAnalysis } from "./helpers";

const best = {
  timeline: "under_1_month",
  budget: "clear_realistic",
  intent: "ready_to_act",
  specificity: "specific",
  financing: "ready",
  decisionMaker: "confirmed",
} as const;

describe("scoreLead", () => {
  it("gives 100 to a lead that is strong on every signal", () => {
    expect(scoreLead(makeAnalysis(best))).toMatchObject({ score: 100, tier: "hot" });
  });

  it("each signal's maximum adds up to exactly 100", () => {
    const total = Object.values(WEIGHTS).reduce((sum, levels) => sum + Math.max(...Object.values(levels)), 0);
    expect(total).toBe(100);
  });

  it("scores a just-browsing lead as cold", () => {
    const r = scoreLead(
      makeAnalysis({ timeline: "browsing", budget: "unknown", intent: "just_checking", specificity: "vague" }),
    );
    expect(r.score).toBe(0 + 6 + 1 + 3 + 5 + 5);
    expect(r.tier).toBe("cold");
  });

  it("takes 5 points per major objection, at most 10", () => {
    const major = { concern: "x", severity: "major" as const, handling: "y" };
    const minor = { ...major, severity: "minor" as const };
    expect(scoreLead(makeAnalysis(best, { objections: [major] })).score).toBe(95);
    expect(scoreLead(makeAnalysis(best, { objections: [major, major, major] })).score).toBe(90);
    expect(scoreLead(makeAnalysis(best, { objections: [minor, minor] })).score).toBe(100);
  });

  it("forces spam and broker leads to junk with score 0, whatever the signals say", () => {
    for (const category of ["not_a_buyer", "channel_partner"] as const) {
      expect(scoreLead(makeAnalysis(best, { category }))).toMatchObject({ score: 0, tier: "junk" });
    }
  });

  it("caps a lead whose budget can't buy what they ask at Cold, however urgent", () => {
    expect(scoreLead(makeAnalysis({ ...best, budget: "likely_unrealistic" }))).toMatchObject({ score: 44, tier: "cold" });
  });

  it("never calls a lead Hot when they are 3+ months from buying, and keeps 6+ months at Cold", () => {
    expect(scoreLead(makeAnalysis({ ...best, timeline: "3_6_months" }))).toMatchObject({ score: 69, tier: "warm" });
    expect(scoreLead(makeAnalysis({ ...best, timeline: "over_6_months" })).tier).toBe("cold");
    expect(scoreLead(makeAnalysis({ ...best, timeline: "1_3_months" })).tier).toBe("hot");
  });

  it("keeps a just-checking lead at Cold even if the form claims urgency", () => {
    expect(scoreLead(makeAnalysis({ ...best, intent: "just_checking" })).tier).toBe("cold");
  });

  it("caps sellers and renters at 25", () => {
    expect(scoreLead(makeAnalysis(best, { category: "wrong_intent" }))).toMatchObject({ score: 25, tier: "cold" });
  });

  it("explains the score with one reason per signal, biggest first, with the evidence quote", () => {
    const { reasons } = scoreLead(makeAnalysis({ ...best, decisionMaker: "needs_approval" }));
    expect(reasons).toHaveLength(6);
    expect(reasons[0]).toMatchObject({ points: 20, evidence: expect.any(String) });
    expect(reasons.at(-1)).toMatchObject({ signal: "decisionMaker", points: 6, max: 10 });
    expect(reasons.map((r) => r.points)).toEqual([...reasons.map((r) => r.points)].sort((a, b) => b - a));
  });
});

describe("tierFor", () => {
  it("uses the documented boundaries", () => {
    expect([19, 20, 44, 45, 69, 70, 100].map(tierFor)).toEqual([
      "junk",
      "cold",
      "cold",
      "warm",
      "warm",
      "hot",
      "hot",
    ]);
  });
});

describe("compareLeads", () => {
  const at = (iso: string) => new Date(iso);
  it("sorts by score, then by timeline urgency, then newest first", () => {
    const a = { score: 80, timelinePoints: 14, createdAt: at("2026-11-20T10:00:00Z") };
    const b = { score: 80, timelinePoints: 20, createdAt: at("2026-11-20T09:00:00Z") };
    const c = { score: 80, timelinePoints: 20, createdAt: at("2026-11-20T11:00:00Z") };
    const d = { score: 90, timelinePoints: 0, createdAt: at("2026-11-19T00:00:00Z") };
    expect([a, b, c, d].sort(compareLeads)).toEqual([d, c, b, a]);
  });
});
