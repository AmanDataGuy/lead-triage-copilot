/**
 * # analyze.ts - runs one lead through the AI and returns a checked LeadAnalysis
 *
 * - Tries each model in order (Gemini, then Groq). If a model returns output that breaks the schema, it gets one
 *   repair attempt with the validation error shown to it. Any other failure (quota, timeout, outage) moves on to
 *   the next model.
 * - Throws AnalysisFailedError only when every model failed; the caller keeps the lead and offers a Retry.
 * - Used by the create, retry and log-call actions, and by the eval script.
 */
import "server-only";
import { generateText, NoObjectGeneratedError, Output, type ModelMessage } from "ai";
import { LeadAnalysis } from "./schema";
import { ANALYSIS_INSTRUCTIONS, analysisPrompt, type LeadForPrompt } from "./prompts";
import { defaultModels, type NamedModel } from "./models";

export class AnalysisFailedError extends Error {}

export type AnalysisResult = { analysis: LeadAnalysis; modelId: string };

// Ask one model for the analysis; on a schema failure, ask once more with the error attached.
async function tryModel({ model, providerOptions }: NamedModel, messages: ModelMessage[]): Promise<LeadAnalysis> {
  const call = (msgs: ModelMessage[]) =>
    generateText({
      model,
      providerOptions,
      instructions: ANALYSIS_INSTRUCTIONS,
      messages: msgs,
      output: Output.object({ schema: LeadAnalysis, name: "lead_analysis" }),
      temperature: 0.2,
      maxOutputTokens: 2500,
      maxRetries: 1,
      timeout: { totalMs: 25_000 },
    });

  try {
    return (await call(messages)).output;
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    const repair: ModelMessage[] = [
      ...messages,
      { role: "assistant", content: error.text ?? "" },
      {
        role: "user",
        content: `Your previous answer did not match the required JSON schema: ${String(error.cause).slice(0, 600)}. Return the corrected JSON only.`,
      },
    ];
    return (await call(repair)).output;
  }
}

// Clip any over-long text the model returned, since Gemini does not enforce string length limits.
function clip(a: LeadAnalysis): LeadAnalysis {
  const c = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  return {
    ...a,
    summary: c(a.summary, 320),
    keyRequirements: a.keyRequirements.map((r) => c(r, 48)),
    suggestedResponse: c(a.suggestedResponse, 900),
    nextAction: { ...a.nextAction, detail: c(a.nextAction.detail, 180) },
  };
}

// Analyse one lead with the first model that succeeds.
export async function analyzeLead(lead: LeadForPrompt, models: NamedModel[] = defaultModels): Promise<AnalysisResult> {
  const messages: ModelMessage[] = [{ role: "user", content: analysisPrompt(lead) }];
  for (const m of models) {
    try {
      return { analysis: clip(await tryModel(m, messages)), modelId: m.id };
    } catch (error) {
      console.warn(`analysis failed on ${m.id}:`, error instanceof Error ? error.message.slice(0, 200) : error);
    }
  }
  throw new AnalysisFailedError("All AI models failed to analyse this lead.");
}
