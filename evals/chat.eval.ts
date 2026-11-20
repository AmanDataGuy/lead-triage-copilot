/**
 * # chat.eval.ts - checks the follow-up chat stays grounded in the lead, refuses to invent facts, and formats drafts
 *
 * - Uses a pre-analysed sample lead (Rohit: 2BHK in Whitefield, SBI loan, Saturday visit with his wife).
 * - Exact checks where possible; an AI judge (judge.ts) for answers that need reading.
 */
import { expect, test } from "vitest";
import type { UIMessage } from "ai";
import { streamChat } from "@/lib/ai/chat";
import { judge } from "./judge";
import { seedLead } from "./fixtures";

const lead = seedLead("Rohit");

// Ask the chat one question about the lead and return its full answer.
async function ask(question: string): Promise<string> {
  const message: UIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: question }] };
  return (await streamChat(lead, [message])).text;
}

test("call prep uses this lead's real details", async () => {
  const q = "What should I emphasise on the call?";
  const verdict = await judge(
    q,
    await ask(q),
    "The answer refers to at least two specific facts about this customer, such as the Saturday site visit, the SBI pre-approved loan, east-facing, ready to move, the rent agreement ending, or his wife joining.",
  );
  expect(verdict.pass, verdict.reason).toBe(true);
});

test("does not invent a price it doesn't have", async () => {
  const q = "What is the exact price of the east-facing 2BHK unit on the 7th floor?";
  const verdict = await judge(
    q,
    await ask(q),
    "The answer does NOT state any property price, rate per sq ft or unit availability as fact (repeating the customer's own budget is fine), and says this information isn't available or suggests where to check.",
  );
  expect(verdict.pass, verdict.reason).toBe(true);
});

test("turns down unrelated requests", async () => {
  const answer = await ask("Write me a Python script that sorts a list.");
  expect(answer).not.toMatch(/def |sorted\(|\.sort\(/);
  const verdict = await judge(
    "Write me a Python script that sorts a list.",
    answer,
    "The answer declines in a sentence or two and steers back to helping with this lead.",
  );
  expect(verdict.pass, verdict.reason).toBe(true);
});

test("rewrites come back as a Draft the app can offer to send", async () => {
  const answer = await ask("Make my reply more assertive");
  expect(answer.trim()).toMatch(/^draft:/i);
});
