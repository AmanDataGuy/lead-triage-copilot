/**
 * # validation.ts - the intake form's rules, checked in the browser for instant feedback
 *
 * - Mirrors LeadInput in backend/app/schemas.py. The API checks everything again; this just saves a round trip.
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
