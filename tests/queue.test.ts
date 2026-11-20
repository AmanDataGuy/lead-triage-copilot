/**
 * # queue.test.ts - pins the Call Loop rules: speed-to-lead timers, call order and change detection
 */
import { describe, expect, it } from "vitest";
import { diffSignals, followUpAt, orderQueue, slaStatus } from "@/lib/queue";
import { makeAnalysis } from "./helpers";

const now = new Date("2026-11-21T10:00:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const inMins = (m: number) => new Date(now.getTime() + m * 60_000);

const lead = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  tier: "warm" as const,
  score: 50,
  status: "ready",
  stage: "new",
  createdAt: minsAgo(10),
  firstContactAt: null as Date | null,
  nextFollowUpAt: null as Date | null,
  ...over,
});

describe("slaStatus", () => {
  it("marks a hot lead overdue after 5 minutes without a call", () => {
    expect(slaStatus(lead("a", { tier: "hot", createdAt: minsAgo(4) }), now)?.overdue).toBe(false);
    expect(slaStatus(lead("a", { tier: "hot", createdAt: minsAgo(6) }), now)).toMatchObject({
      overdue: true,
      waitingMs: 6 * 60_000,
    });
  });

  it("stops the timer once the lead is contacted, and never runs it for junk", () => {
    expect(slaStatus(lead("a", { firstContactAt: minsAgo(1) }), now)).toBeNull();
    expect(slaStatus(lead("a", { tier: "junk" }), now)).toBeNull();
  });
});

describe("orderQueue", () => {
  it("puts overdue new leads first, then due follow-ups, then fresh leads, then scheduled ones", () => {
    const leads = [
      lead("scheduled", { firstContactAt: minsAgo(60), nextFollowUpAt: inMins(30) }),
      lead("fresh-warm", { createdAt: minsAgo(5) }),
      lead("followup", { firstContactAt: minsAgo(60), nextFollowUpAt: minsAgo(1) }),
      lead("overdue-hot", { tier: "hot", score: 80, createdAt: minsAgo(12) }),
      lead("junk", { tier: "junk", score: 0 }),
      lead("lost", { stage: "closed_lost" }),
      lead("analysing", { status: "analyzing" }),
    ];
    expect(orderQueue(leads, now).map((q) => q.lead.id)).toEqual([
      "overdue-hot",
      "followup",
      "fresh-warm",
      "scheduled",
    ]);
  });

  it("orders fresh leads by score", () => {
    const leads = [lead("low", { score: 50 }), lead("high", { score: 65 })];
    expect(orderQueue(leads, now).map((q) => q.lead.id)).toEqual(["high", "low"]);
  });
});

describe("followUpAt", () => {
  it("turns the AI's timing into a concrete time", () => {
    expect(followUpAt("today", now)).toEqual(inMins(240));
  });
});

describe("diffSignals", () => {
  it("lists only the signals that changed, with the new evidence", () => {
    const before = makeAnalysis({ financing: "uncertain", timeline: "1_3_months" });
    const after = makeAnalysis({ financing: "ready", timeline: "1_3_months" });
    expect(diffSignals(before, after)).toEqual([
      { signal: "Financing", from: "uncertain", to: "ready", evidence: "quote for ready" },
    ]);
    expect(diffSignals(null, after)).toEqual([]);
  });
});
