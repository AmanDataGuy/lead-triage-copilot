/**
 * # schema.ts - the exact shape the AI must return for one lead
 *
 * - Sent to the model as a JSON schema (Gemini and Groq both enforce it), then checked again with Zod.
 * - The model only picks levels from fixed lists and quotes evidence. It never picks the score:
 *   scoring.ts turns these levels into points, so the score is repeatable and explainable.
 * - Every field is required (no optional) because Groq's strict mode demands it.
 * - Word limits live in descriptions, not .max(): Gemini ignores string length limits, so we trim in code instead.
 */
import { z } from "zod";

const evidence = z
  .string()
  .describe('Short verbatim quote from the lead (max 12 words) that supports this level, or "not stated"');

const signal = <T extends readonly [string, ...string[]]>(levels: T, help: string) =>
  z.object({ level: z.enum(levels).describe(help), evidence });

export const SIGNAL_LEVELS = {
  timeline: ["under_1_month", "1_3_months", "3_6_months", "over_6_months", "browsing", "unknown"],
  budget: ["clear_realistic", "stretch", "likely_unrealistic", "unknown"],
  intent: ["ready_to_act", "specific_questions", "generic", "just_checking"],
  specificity: ["specific", "partial", "vague"],
  financing: ["ready", "planned", "uncertain", "unknown"],
  decisionMaker: ["confirmed", "needs_approval", "proxy", "unknown"],
} as const;

export const LeadAnalysis = z.object({
  category: z
    .enum(["buyer", "wrong_intent", "channel_partner", "not_a_buyer"])
    .describe(
      "buyer = wants to buy; wrong_intent = wants to sell or rent instead; channel_partner = a broker asking for inventory or commission; not_a_buyer = spam, vendor pitch, job seeker, gibberish",
    ),
  inputQuality: z.enum(["ok", "thin"]).describe("thin = too little information to judge the lead properly"),
  summary: z.string().describe("One or two plain sentences a busy salesperson can read in 5 seconds, max 40 words"),
  intent: z.object({
    type: z.enum(["self_use", "investment", "rent", "browsing", "selling", "unclear"]),
    explanation: z.string().describe("One sentence, max 20 words"),
  }),
  keyRequirements: z
    .array(z.string().describe('Max 6 words, e.g. "3BHK", "Near ITPL", "Ready to move"'))
    .min(1)
    .max(6),
  objections: z
    .array(
      z.object({
        concern: z.string().describe("The customer's concern in max 12 words"),
        severity: z.enum(["minor", "major"]),
        handling: z.string().describe("How the salesperson can answer it, max 20 words, no invented facts"),
      }),
    )
    .max(4),
  contradictions: z
    .array(z.string().describe('Something that does not add up, phrased as a check, e.g. "Verify budget: ..." (max 25 words)'))
    .max(3),
  missingInfo: z
    .array(z.string().describe("A question the salesperson should ask to fill a gap, max 15 words"))
    .max(3),
  signals: z.object({
    timeline: signal(SIGNAL_LEVELS.timeline, "How soon they plan to buy"),
    budget: signal(
      SIGNAL_LEVELS.budget,
      "clear_realistic = a stated figure that plausibly fits the requirement and location; likely_unrealistic = clearly too low for what they ask",
    ),
    intent: signal(
      SIGNAL_LEVELS.intent,
      "ready_to_act = asks for a site visit, price sheet, booking or token; specific_questions = asks about possession, carpet area, amenities; generic = 'send details'; just_checking = browsing",
    ),
    specificity: signal(
      SIGNAL_LEVELS.specificity,
      "specific = configuration plus micro-location or project plus a must-have; partial = configuration plus area; vague = 'a flat anywhere'",
    ),
    financing: signal(
      SIGNAL_LEVELS.financing,
      "ready = loan sanctioned or own funds ready; planned = intends a loan or sale proceeds; uncertain = unsure if they qualify",
    ),
    decisionMaker: signal(
      SIGNAL_LEVELS.decisionMaker,
      "confirmed = decides alone or all deciders are involved; needs_approval = needs a spouse or parent to agree; proxy = enquiring for someone else",
    ),
  }),
  nextAction: z.object({
    action: z.enum([
      "call_now",
      "book_site_visit",
      "send_details",
      "clarify_budget",
      "nurture",
      "reroute",
      "disqualify",
    ]),
    when: z.enum(["now", "today", "this_week", "later"]),
    detail: z.string().describe("The concrete next step in one sentence, max 20 words"),
  }),
  callBrief: z.object({
    opener: z.string().describe("First line to say on the call, personal to this lead, max 25 words"),
    emphasize: z.array(z.string().describe("A point to stress on the call, max 12 words")).min(1).max(3),
    objectionReply: z
      .string()
      .describe("One-line answer to the most likely objection, max 25 words, no invented prices or facts"),
  }),
  suggestedResponse: z
    .string()
    .describe(
      "Message the salesperson can send now, written as the salesperson, in the customer's language and script, max 90 words",
    ),
  language: z.enum(["english", "hinglish", "hindi", "other"]).describe("The language the customer wrote in"),
});

export type LeadAnalysis = z.infer<typeof LeadAnalysis>;
export type SignalName = keyof typeof SIGNAL_LEVELS;
