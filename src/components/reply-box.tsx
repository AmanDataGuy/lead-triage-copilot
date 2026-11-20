"use client";
/**
 * # reply-box.tsx - the AI-suggested message to the customer, with Copy and WhatsApp buttons
 *
 * - WhatsApp uses a wa.me link: it opens WhatsApp with the text filled in, and the salesperson still presses Send.
 *   No message ever goes to a customer without a human approving it.
 */
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Build a wa.me link; 10-digit Indian numbers get the +91 country code added.
export function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

// Show a reply with one-tap copy and WhatsApp send.
export function ReplyBox({ text, phone, title = "Suggested reply" }: { text: string; phone: string; title?: string }) {
  const wa = whatsappLink(phone, text);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success("Reply copied");
  };
  return (
    <section className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy aria-hidden /> Copy
          </Button>
          {wa && (
            <Button asChild size="sm" className="bg-green-700 text-white hover:bg-green-800">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden /> WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </section>
  );
}
