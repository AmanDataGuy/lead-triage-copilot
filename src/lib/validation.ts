/**
 * # validation.ts - what a salesperson may submit, checked the same way in the browser and on the server
 *
 * - LeadInput: the intake form (name, location, requirement, budget, timeline, message, optional phone).
 * - LogCallInput / ChatInput: the other two things a visitor can send.
 * - prefilter(): a free check that rejects gibberish before we spend an AI call on it.
 */
import { z } from "zod";

export const TIMELINES = [
  "Immediately",
  "Within 1 month",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just exploring",
] as const;

const field = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(200, `${label} is too long (max 200 characters)`);

export const LeadInput = z.strictObject({
  name: field("Name"),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s()-]*$/, "Phone can only contain digits, spaces, +, - and brackets")
    .default(""),
  location: field("Location"),
  requirement: field("Property requirement"),
  budget: field("Budget"),
  timeline: z.enum(TIMELINES, { error: "Pick a buying timeline" }),
  message: z.string().trim().max(6000, "Message is too long (max 6,000 characters)").default(""),
});
export type LeadInput = z.infer<typeof LeadInput>;

export const CALL_OUTCOMES = ["no_answer", "connected", "visit_booked", "not_interested"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const LogCallInput = z.strictObject({
  leadId: z.uuid(),
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().trim().max(2000, "Notes are too long (max 2,000 characters)").default(""),
});

export const ChatInput = z.strictObject({
  leadId: z.uuid(),
  message: z.strictObject({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z.array(z.strictObject({ type: z.literal("text"), text: z.string().trim().min(1).max(1000) })).length(1),
  }),
});

// Reject input that has almost no real words, so obvious junk never costs an AI call.
export function prefilter(input: Pick<LeadInput, "requirement" | "message" | "location">): string | null {
  const text = `${input.requirement} ${input.location} ${input.message}`;
  const words = text.match(/\p{L}{2,}/gu) ?? [];
  if (words.length < 3) return "Add a few real details about what the customer wants.";
  return null;
}
