/**
 * # route.ts (POST /api/chat) - the follow-up chat about one lead, streamed back as it is written
 *
 * - The browser sends only the lead id and the new message. Everything the AI sees about the lead (form, message,
 *   analysis, call notes, last 12 chat turns) is loaded here from the database, so it cannot be tampered with.
 * - Both messages are saved when the answer finishes, even if the browser disconnects mid-stream.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { db, leads, messages } from "@/lib/db";
import { allProviderOptions, defaultModels, firstAvailable } from "@/lib/ai/models";
import { chatInstructions } from "@/lib/ai/prompts";
import { consumeAiCall, QuotaError } from "@/lib/limits";
import { ChatInput } from "@/lib/validation";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 60;

const HISTORY_TURNS = 12;

// Answer one chat message about one lead.
export async function POST(request: Request) {
  const parsed = ChatInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { leadId, message } = parsed.data;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) return Response.json({ error: "Missing session" }, { status: 401 });

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)));
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });

  try {
    await consumeAiCall(workspaceId);
  } catch (error) {
    if (error instanceof QuotaError) return Response.json({ error: error.message }, { status: 429 });
    throw error;
  }

  const recent = await db
    .select()
    .from(messages)
    .where(eq(messages.leadId, leadId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_TURNS);
  const history: UIMessage[] = recent.reverse().map((m) => ({ id: m.id, role: m.role, parts: m.parts }));
  const userMessage: UIMessage = { id: message.id, role: "user", parts: message.parts };
  const conversation = [...history, userMessage];

  const result = streamText({
    model: firstAvailable(defaultModels),
    providerOptions: allProviderOptions,
    instructions: chatInstructions(lead, lead.analysis),
    messages: await convertToModelMessages(conversation),
    temperature: 0.5,
    maxOutputTokens: 700,
    maxRetries: 0,
    timeout: { totalMs: 30_000 },
  });
  // Keep reading the answer even if the browser goes away, so onEnd still saves it.
  void result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: conversation,
      generateMessageId: () => crypto.randomUUID(),
      onError: () => "Couldn't reach the AI. Please try again.",
      onEnd: async ({ messages: all }) => {
        const answer = all.at(-1);
        if (!answer || answer.role !== "assistant") return;
        await db
          .insert(messages)
          .values([
            { id: userMessage.id, leadId, role: "user", parts: userMessage.parts },
            { id: answer.id, leadId, role: "assistant", parts: answer.parts },
          ])
          .onConflictDoNothing();
      },
    }),
  });
}
