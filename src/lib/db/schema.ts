/**
 * # schema.ts - the database tables (Postgres, via Drizzle)
 *
 * - workspaces: one per browser (anonymous cookie), so every visitor gets their own private set of leads.
 * - leads: the intake form, the stored AI analysis with its computed score/tier, and call-loop state.
 * - messages: the follow-up chat history for each lead.
 * - activities: one row per logged call, recording how the score changed and why.
 * - usage: daily counters that protect the free AI quota.
 */
import { date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";
import type { LeadAnalysis } from "@/lib/ai/schema";
import type { Reason, Tier } from "@/lib/scoring";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    location: text("location").notNull(),
    requirement: text("requirement").notNull(),
    budget: text("budget").notNull(),
    timeline: text("timeline").notNull(),
    message: text("message").notNull().default(""),
    callNotes: text("call_notes").notNull().default(""),
    status: text("status", { enum: ["analyzing", "ready", "failed"] }).notNull().default("analyzing"),
    analysis: jsonb("analysis").$type<LeadAnalysis>(),
    score: integer("score"),
    tier: text("tier").$type<Tier>(),
    reasons: jsonb("reasons").$type<Reason[]>(),
    model: text("model"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    stage: text("stage", { enum: ["new", "contacted", "visit_booked", "closed_lost"] }).notNull().default("new"),
    firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leads_workspace_idx").on(t.workspaceId, t.score)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    parts: jsonb("parts").$type<UIMessage["parts"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_lead_idx").on(t.leadId, t.createdAt)],
);

export type SignalChange = { signal: string; from: string; to: string; evidence: string };

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(),
    note: text("note").notNull().default(""),
    scoreBefore: integer("score_before"),
    scoreAfter: integer("score_after"),
    changes: jsonb("changes").$type<SignalChange[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_lead_idx").on(t.leadId, t.createdAt)],
);

export const usage = pgTable(
  "usage",
  {
    day: date("day").notNull(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.key] })],
);

export type Lead = typeof leads.$inferSelect;
export type Activity = typeof activities.$inferSelect;
