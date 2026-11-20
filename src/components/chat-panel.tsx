"use client";
/**
 * # chat-panel.tsx - "Ask AI" about this one lead, streamed as it answers
 *
 * - Sends only the lead id and the new message; the server adds the lead's record (see api/chat/route.ts).
 * - When the AI writes a message for the customer it starts with "Draft:". Those answers get Copy, WhatsApp and
 *   "Use as reply" buttons, so the salesperson approves every message before it goes anywhere.
 */
import { useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReplyBox } from "@/components/reply-box";
import { cn } from "@/lib/utils";
import { applyReply } from "@/app/actions";

const SUGGESTIONS = [
  "What should I emphasise on the call?",
  "Make my reply more assertive",
  "Rewrite my reply in Hinglish",
  "What's missing before a site visit?",
];

const textOf = (m: UIMessage) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");

// The chat for one lead.
export function ChatPanel({ leadId, phone, initialMessages }: { leadId: string; phone: string; initialMessages: UIMessage[] }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    id: leadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Send only what the server needs; it loads the lead and the history itself.
      prepareSendMessagesRequest: ({ id, messages: all }) => {
        const last = all.at(-1)!;
        return { body: { leadId: id, message: { id: last.id, role: "user", parts: [{ type: "text", text: textOf(last) }] } } };
      },
    }),
    onError: (e) => toast.error(e.message || "Couldn't reach the AI."),
  });
  const busy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text: text.trim() });
    setInput("");
  };

  return (
    <div className="space-y-3">
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}

      <ol className="space-y-3" aria-live="polite">
        {messages.map((m) => {
          const text = textOf(m);
          const draft = m.role === "assistant" && /^\s*draft:/i.test(text) ? text.replace(/^\s*draft:\s*/i, "") : null;
          return (
            <li key={m.id} className={cn("flex", m.role === "user" && "justify-end")}>
              {draft !== null && !(busy && m.id === messages.at(-1)?.id) ? (
                <div className="w-full space-y-2">
                  <ReplyBox title="Draft" text={draft} phone={phone} />
                  <UseReplyButton leadId={leadId} text={draft} />
                </div>
              ) : (
                <p
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {text || "…"}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {status === "submitted" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…
        </p>
      )}
      {error && <p className="text-sm text-destructive">The last message failed. Try sending it again.</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder="Ask about this lead, or ask for a rewrite…"
          aria-label="Message"
        />
        <Button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          <Send aria-hidden />
        </Button>
      </form>
    </div>
  );
}

// Save a chat draft as the lead's suggested reply, after the salesperson clicks.
function UseReplyButton({ leadId, text }: { leadId: string; text: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          const { error } = await applyReply(leadId, text);
          if (error) toast.error(error);
          else {
            setDone(true);
            toast.success("Saved as the suggested reply");
          }
        })
      }
    >
      {done ? <Check aria-hidden /> : null}
      {done ? "Saved as suggested reply" : "Use as suggested reply"}
    </Button>
  );
}
