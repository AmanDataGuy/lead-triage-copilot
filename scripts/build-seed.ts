/**
 * # build-seed.ts - runs the sample leads through the real AI pipeline once and saves the results
 *
 * - Output: src/lib/seed.json, copied into every new workspace so browsing the demo costs no AI quota.
 * - Run: `npm run seed:build` (needs the AI keys in .env.local).
 */
import { writeFileSync } from "node:fs";
import { analyzeLead } from "@/lib/ai/analyze";
import { scoreLead } from "@/lib/scoring";
import { SEED_LEADS } from "./seed-leads";

const out = [];
for (const { minutesAgo, lead } of SEED_LEADS) {
  const { analysis, modelId } = await analyzeLead({ ...lead, callNotes: "" });
  const { score, tier } = scoreLead(analysis);
  console.log(`${tier.padEnd(4)} ${String(score).padStart(3)}  ${lead.name}  (${modelId})`);
  out.push({ minutesAgo, lead, analysis, model: modelId });
}
writeFileSync("src/lib/seed.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${out.length} analysed sample leads to src/lib/seed.json`);
