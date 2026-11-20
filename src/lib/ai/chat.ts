/**
 * # chat.ts - the follow-up chat's AI call, kept apart from the HTTP route so evals can call it directly
 *
 * - Uses the first available model (Gemini, else Groq) and the chat rules + this lead's record from prompts.ts.
 * - Returns the AI SDK stream result: the route streams it to the browser, the eval just awaits `.text`.
 */
import "server-only";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { Lead } from "@/lib/db/schema";
import { allProviderOptions, defaultModels, firstAvailable } from "./models";
import { chatInstructions } from "./prompts";

// Start the AI's answer to the latest message in this lead's conversation.
export async function streamChat(lead: Lead, conversation: UIMessage[]) {
  return streamText({
    model: firstAvailable(defaultModels),
    providerOptions: allProviderOptions,
    instructions: chatInstructions(lead, lead.analysis),
    messages: await convertToModelMessages(conversation),
    temperature: 0.5,
    maxOutputTokens: 700,
    maxRetries: 0,
    timeout: { totalMs: 30_000 },
  });
}
