/**
 * # analyze.test.ts - checks the AI call's fallback and repair paths with fake models (no network, no quota)
 */
import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { analyzeLead, AnalysisFailedError } from "@/lib/ai/analyze";
import { makeAnalysis } from "./helpers";

const lead = {
  name: "Rohit",
  location: "Whitefield",
  requirement: "2BHK",
  budget: "85L",
  timeline: "Within 1 month",
  message: "Need to move fast",
  callNotes: "",
};

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

// A fake model that answers each call with the next text in the list, or throws if the entry is an Error.
function fakeModel(replies: (string | Error)[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const reply = replies[Math.min(i++, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      return {
        content: [{ type: "text", text: reply }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

const good = JSON.stringify(makeAnalysis({ timeline: "under_1_month" }));

describe("analyzeLead", () => {
  it("returns the primary model's analysis when it is valid", async () => {
    const primary = fakeModel([good]);
    const result = await analyzeLead(lead, [{ id: "primary", model: primary }]);
    expect(result.modelId).toBe("primary");
    expect(result.analysis.signals.timeline.level).toBe("under_1_month");
    expect(JSON.stringify(primary.doGenerateCalls[0].prompt)).toContain("<customer_message>");
  });

  it("repairs once when the first answer breaks the schema", async () => {
    const primary = fakeModel(['{"summary": 1}', good]);
    const result = await analyzeLead(lead, [{ id: "primary", model: primary }]);
    expect(result.modelId).toBe("primary");
    expect(primary.doGenerateCalls).toHaveLength(2);
    expect(JSON.stringify(primary.doGenerateCalls[1].prompt)).toContain("did not match the required JSON schema");
  });

  it("falls back to the next model when the primary is out of quota", async () => {
    const result = await analyzeLead(lead, [
      { id: "primary", model: fakeModel([new Error("429 quota exceeded")]) },
      { id: "fallback", model: fakeModel([good]) },
    ]);
    expect(result.modelId).toBe("fallback");
  });

  it("throws AnalysisFailedError when every model fails", async () => {
    await expect(
      analyzeLead(lead, [
        { id: "a", model: fakeModel(["not json"]) },
        { id: "b", model: fakeModel([new Error("down")]) },
      ]),
    ).rejects.toBeInstanceOf(AnalysisFailedError);
  });
});
