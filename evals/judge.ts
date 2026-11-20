/**
 * # judge.ts - "AI as judge" for answers that can't be checked with exact rules (e.g. did the chat invent a price?)
 *
 * - The judge is Gemini 3.5 Flash: a stronger model than the one under test, asked one yes/no question at a time.
 * - Returns pass/fail with a one-line reason, so a failed eval says why.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// Ask the judge whether an answer meets one plain-English criterion.
export async function judge(question: string, answer: string, criterion: string) {
  const { output } = await generateText({
    model: google("gemini-3.5-flash"),
    temperature: 0,
    output: Output.object({ schema: z.object({ pass: z.boolean(), reason: z.string() }) }),
    prompt: `You are grading a sales assistant's answer. Be strict.

Question asked by the salesperson:
${question}

Assistant's answer:
${answer}

Criterion: ${criterion}

Does the answer meet the criterion? Give pass true or false and a one-sentence reason.`,
  });
  return output;
}
