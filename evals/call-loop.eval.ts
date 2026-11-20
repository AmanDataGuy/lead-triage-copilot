/**
 * # call-loop.eval.ts - checks the own feature: notes from a call should update the lead's signals and score
 *
 * - Starts from a pre-analysed sample lead (Priya: funds depend on selling a flat, husband not yet involved),
 *   adds call notes that resolve both, and re-runs the same analysis pipeline the "Log call" button uses.
 */
import { expect, test } from "vitest";
import { analyzeLead } from "@/lib/ai/analyze";
import { scoreLead } from "@/lib/scoring";
import { diffSignals } from "@/lib/queue";
import { seedLead } from "./fixtures";

test("call notes about funds and the husband raise the score and update the follow-up", async () => {
  const lead = seedLead("Priya");
  const callNotes =
    "[21 Nov, Site visit booked] Chennai flat sale closed last week, so funds are ready. Her husband was on the call and agreed; both are visiting Saturday 11am.";

  const { analysis } = await analyzeLead({ ...lead, callNotes });
  const after = scoreLead(analysis);
  const changes = diffSignals(lead.analysis, analysis).map((c) => c.signal);

  expect(analysis.signals.financing.level).toBe("ready");
  expect(changes).toContain("Financing");
  expect(after.score).toBeGreaterThan(lead.score!);
  expect(analysis.suggestedResponse).toMatch(/saturday/i);
});
