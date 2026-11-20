/**
 * # fixtures.ts - turns a pre-analysed sample lead (src/lib/seed.json) into a full lead row for the evals
 */
import seed from "@/lib/seed.json";
import type { Lead } from "@/lib/db/schema";
import type { LeadAnalysis } from "@/lib/ai/schema";
import { scoreLead } from "@/lib/scoring";

type SeedLead = { lead: Omit<Lead, "id">; analysis: LeadAnalysis; model: string };

// Build the lead row a sample lead would have in the database, by name.
export function seedLead(name: string): Lead {
  const found = (seed as unknown as SeedLead[]).find((s) => s.lead.name.startsWith(name));
  if (!found) throw new Error(`No sample lead named ${name}`);
  const { score, tier, reasons } = scoreLead(found.analysis);
  return {
    ...found.lead,
    id: crypto.randomUUID(),
    workspaceId: crypto.randomUUID(),
    callNotes: "",
    status: "ready",
    analysis: found.analysis,
    score,
    tier,
    reasons,
    model: found.model,
    analyzedAt: new Date(),
    stage: "new",
    firstContactAt: null,
    nextFollowUpAt: null,
    createdAt: new Date(),
  };
}
