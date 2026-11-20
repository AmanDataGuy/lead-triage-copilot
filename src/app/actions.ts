"use server";
/**
 * # actions.ts - every change a salesperson can make, run on the server
 *
 * - createLead, retryAnalysis, logCall, applyReply, deleteLead, resetDemo.
 * - Each one validates its input with Zod, works only inside the visitor's own workspace (from the cookie),
 *   and never trusts ids or scores sent by the browser.
 * - The AI is called through analyzeLead(); the score always comes from scoring.ts, never from the model.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { activities, db, leads, type Lead } from "@/lib/db";
import { analyzeLead, AnalysisFailedError } from "@/lib/ai/analyze";
import { scoreLead } from "@/lib/scoring";
import { diffSignals, followUpAt, NO_ANSWER_RETRY_MS } from "@/lib/queue";
import { consumeAiCall, QuotaError } from "@/lib/limits";
import { LeadInput, LogCallInput, prefilter, type CallOutcome } from "@/lib/validation";
import { getWorkspaceId, resetWorkspace } from "@/lib/workspace";

export type ActionResult = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

// Load a lead only if it belongs to this visitor's workspace.
async function ownedLead(leadId: unknown): Promise<Lead> {
  const id = z.uuid().parse(leadId);
  const workspaceId = await getWorkspaceId();
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)));
  if (!lead) throw new Error("Lead not found");
  return lead;
}

// Run the AI on a stored lead and save the analysis with its computed score; returns a user-facing error or null.
async function analyzeAndSave(lead: Lead): Promise<{ error: string | null; updated: Lead | null }> {
  try {
    await consumeAiCall(lead.workspaceId);
    const { analysis, modelId } = await analyzeLead(lead);
    const { score, tier, reasons } = scoreLead(analysis);
    const [updated] = await db
      .update(leads)
      .set({ status: "ready", analysis, score, tier, reasons, model: modelId, analyzedAt: new Date() })
      .where(eq(leads.id, lead.id))
      .returning();
    return { error: null, updated };
  } catch (error) {
    // Keep the lead's previous analysis if it had one; only a never-analysed lead is marked failed.
    if (lead.status !== "ready") await db.update(leads).set({ status: "failed" }).where(eq(leads.id, lead.id));
    if (error instanceof QuotaError) return { error: error.message, updated: null };
    if (error instanceof AnalysisFailedError) {
      return { error: "The AI is unavailable right now. Please retry.", updated: null };
    }
    throw error;
  }
}

// Save a new lead, analyse it, and open it.
export async function createLead(input: unknown): Promise<ActionResult> {
  const parsed = LeadInput.safeParse(input);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const junk = prefilter(parsed.data);
  if (junk) return { error: junk };

  const workspaceId = await getWorkspaceId();
  const [lead] = await db
    .insert(leads)
    .values({ ...parsed.data, workspaceId })
    .returning();
  const { error } = await analyzeAndSave(lead);
  revalidatePath("/leads", "layout");
  redirect(`/leads/${lead.id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

// Run the analysis again for a lead whose first attempt failed.
export async function retryAnalysis(leadId: string): Promise<ActionResult> {
  const lead = await ownedLead(leadId);
  const { error } = await analyzeAndSave(lead);
  revalidatePath("/leads", "layout");
  return error ? { error } : {};
}

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  no_answer: "No answer",
  connected: "Connected",
  visit_booked: "Site visit booked",
  not_interested: "Not interested",
};

export type LogCallResult = ActionResult & { scoreBefore?: number | null; scoreAfter?: number | null };

// Record a call. Real conversations go back through the AI so the score, next step and follow-up draft update.
export async function logCall(input: unknown): Promise<LogCallResult> {
  const parsed = LogCallInput.safeParse(input);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { leadId, outcome, note } = parsed.data;
  const lead = await ownedLead(leadId);
  const now = new Date();
  const firstContactAt = lead.firstContactAt ?? now;

  // No answer or a closed lead: nothing new to learn, so no AI call.
  if (outcome === "no_answer" || outcome === "not_interested") {
    await db
      .update(leads)
      .set({
        firstContactAt,
        stage: outcome === "not_interested" ? "closed_lost" : lead.stage,
        nextFollowUpAt: outcome === "no_answer" ? new Date(now.getTime() + NO_ANSWER_RETRY_MS) : null,
      })
      .where(eq(leads.id, lead.id));
    await db.insert(activities).values({ leadId, outcome, note, scoreBefore: lead.score, scoreAfter: lead.score });
    revalidatePath("/leads", "layout");
    return {};
  }

  const stamp = now.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const callNotes = `${lead.callNotes}\n[${stamp}, ${OUTCOME_LABEL[outcome]}] ${note || "(no notes)"}`.trim();
  const [withNotes] = await db
    .update(leads)
    .set({ callNotes, firstContactAt, stage: outcome === "visit_booked" ? "visit_booked" : "contacted" })
    .where(eq(leads.id, lead.id))
    .returning();

  const { error, updated } = await analyzeAndSave(withNotes);
  const after = updated?.analysis ?? null;
  await db.insert(activities).values({
    leadId,
    outcome,
    note,
    scoreBefore: lead.score,
    scoreAfter: updated?.score ?? lead.score,
    changes: after ? diffSignals(lead.analysis, after) : [],
  });
  if (after) {
    await db
      .update(leads)
      .set({ nextFollowUpAt: followUpAt(after.nextAction.when, now) })
      .where(eq(leads.id, lead.id));
  }

  revalidatePath("/leads", "layout");
  return { error: error ?? undefined, scoreBefore: lead.score, scoreAfter: updated?.score ?? lead.score };
}

// Save a reply the salesperson approved from the chat as this lead's suggested response.
export async function applyReply(leadId: string, text: string): Promise<ActionResult> {
  const reply = z.string().trim().min(1).max(1500).parse(text);
  const lead = await ownedLead(leadId);
  if (!lead.analysis) return { error: "This lead has no analysis yet." };
  await db
    .update(leads)
    .set({ analysis: { ...lead.analysis, suggestedResponse: reply } })
    .where(eq(leads.id, lead.id));
  revalidatePath(`/leads/${lead.id}`);
  return {};
}

// Delete one lead (its chat and call history go with it).
export async function deleteLead(leadId: string): Promise<void> {
  const lead = await ownedLead(leadId);
  await db.delete(leads).where(eq(leads.id, lead.id));
  revalidatePath("/leads", "layout");
  redirect("/leads");
}

// Put the sample leads back, removing everything this visitor added.
export async function resetDemo(): Promise<void> {
  await resetWorkspace(await getWorkspaceId());
  revalidatePath("/leads", "layout");
  redirect("/leads");
}
