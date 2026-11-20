"use server";
/**
 * # actions.ts - every change a salesperson can make, forwarded to the Python API
 *
 * - createLead, retryAnalysis, logCall, applyReply, deleteLead, resetDemo.
 * - The API (backend/app/main.py) validates input, runs the AI and owns every business rule; these functions only
 *   call it, turn its errors into form messages, and refresh the pages.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";

export type ActionResult = { error?: string; fieldErrors?: Record<string, string[]> };
export type LogCallResult = ActionResult & { scoreBefore?: number | null; scoreAfter?: number | null };

type ApiError = { detail?: string | { loc: (string | number)[]; msg: string }[] };

// Turn a FastAPI error body into a message or per-field messages for the form.
function toResult({ detail }: ApiError = {}): ActionResult {
  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string[]> = {};
    for (const e of detail) (fieldErrors[String(e.loc.at(-1))] ??= []).push(e.msg);
    return { fieldErrors };
  }
  return { error: detail ?? "Something went wrong. Please try again." };
}

// Save a new lead, let the API analyse it, and open it.
export async function createLead(input: unknown): Promise<ActionResult> {
  const res = await api<{ id: string; error: string | null } & ApiError>("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) return toResult(res.data);
  revalidatePath("/leads", "layout");
  const { id, error } = res.data;
  redirect(`/leads/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

// Run the analysis again for a lead whose first attempt failed.
export async function retryAnalysis(leadId: string): Promise<ActionResult> {
  const res = await api<{ error: string | null } & ApiError>(`/api/leads/${leadId}/retry`, { method: "POST" });
  revalidatePath("/leads", "layout");
  if (!res.ok) return toResult(res.data);
  return res.data.error ? { error: res.data.error } : {};
}

// Record a call; the API re-analyses real conversations and returns the score before and after.
export async function logCall(input: { leadId: string; outcome: string; note: string }): Promise<LogCallResult> {
  const { leadId, ...body } = input;
  const res = await api<LogCallResult & ApiError>(`/api/leads/${leadId}/calls`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  revalidatePath("/leads", "layout");
  if (!res.ok) return toResult(res.data);
  return { ...res.data, error: res.data.error ?? undefined };
}

// Save a reply the salesperson approved from the chat as this lead's suggested response.
export async function applyReply(leadId: string, text: string): Promise<ActionResult> {
  const res = await api<ApiError>(`/api/leads/${leadId}/reply`, { method: "PUT", body: JSON.stringify({ text }) });
  revalidatePath(`/leads/${leadId}`);
  return res.ok ? {} : toResult(res.data);
}

// Delete one lead (its chat and call history go with it).
export async function deleteLead(leadId: string): Promise<void> {
  await api(`/api/leads/${leadId}`, { method: "DELETE" });
  revalidatePath("/leads", "layout");
  redirect("/leads");
}

// Put the sample leads back, removing everything this visitor added.
export async function resetDemo(): Promise<void> {
  await api("/api/reset", { method: "POST" });
  revalidatePath("/leads", "layout");
  redirect("/leads");
}
