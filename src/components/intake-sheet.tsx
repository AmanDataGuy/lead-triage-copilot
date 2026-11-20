"use client";
/**
 * # intake-sheet.tsx - the "New lead" form in a slide-over panel
 *
 * - Checked in the browser with the same Zod schema the server uses (LeadInput), then sent to createLead.
 * - "Fill example" loads a realistic Hinglish lead so a reviewer can try the AI in one click.
 */
import { useState, useTransition } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LeadInput, TIMELINES } from "@/lib/validation";
import { createLead } from "@/app/actions";

type FormValues = z.input<typeof LeadInput>;

const EXAMPLE: FormValues = {
  name: "Ananya Iyer",
  phone: "+91 98804 11223",
  location: "Hebbal, Bengaluru",
  requirement: "3BHK near Manyata Tech Park, ready to move",
  budget: "₹1.3-1.5 Cr",
  timeline: "Within 1 month",
  message:
    "Hi, hum dono Manyata mein kaam karte hain, commute kam karna hai. 3BHK ready to move chahiye, ICICI se loan pre-approved hai (1.1 Cr). Is weekend site visit possible hai? Bas ek concern hai, maintenance charges kitne hain?",
};

const FIELDS = [
  { name: "name", label: "Name", placeholder: "Customer name" },
  { name: "phone", label: "Phone (optional, for WhatsApp)", placeholder: "+91 98xxx xxxxx" },
  { name: "location", label: "Location", placeholder: "e.g. Whitefield, Bengaluru" },
  { name: "requirement", label: "Property requirement", placeholder: "e.g. 2BHK, ready to move" },
  { name: "budget", label: "Budget", placeholder: "e.g. ₹80L-1Cr" },
] as const;

// The New lead button and its form.
export function IntakeSheet() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues, unknown, LeadInput>({
    resolver: zodResolver(LeadInput),
    defaultValues: { name: "", phone: "", location: "", requirement: "", budget: "", message: "" },
  });
  const { errors } = form.formState;
  const messageLength = useWatch({ control: form.control, name: "message" })?.length ?? 0;

  // Send the form to the server; the server analyses the lead and opens it.
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createLead(values);
      // A successful create redirects, so reaching here means something needs fixing.
      if (result?.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof FormValues, { message: messages?.[0] });
        }
      }
      if (result?.error) toast.error(result.error);
      else {
        form.reset();
        setOpen(false);
      }
    }),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden /> New lead
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New lead</SheetTitle>
          <SheetDescription>
            Paste what you know. The AI reads it, scores the lead and drafts your reply.{" "}
            <button type="button" className="underline" onClick={() => form.reset(EXAMPLE)}>
              Fill example
            </button>
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="grid gap-4 px-4 pb-6" noValidate>
          {FIELDS.map(({ name, label, placeholder }) => (
            <div key={name} className="grid gap-1.5">
              <Label htmlFor={name}>{label}</Label>
              <Input id={name} placeholder={placeholder} aria-invalid={!!errors[name]} {...form.register(name)} />
              {errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="timeline">Buying timeline</Label>
            <Controller
              control={form.control}
              name="timeline"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger id="timeline" className="w-full" aria-invalid={!!errors.timeline}>
                    <SelectValue placeholder="When do they want to buy?" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMELINES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.timeline && <p className="text-sm text-destructive">{errors.timeline.message}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="message">Customer message or chat transcript</Label>
            <Textarea
              id="message"
              rows={7}
              placeholder={"Paste their enquiry or a WhatsApp chat, e.g.\nLead: possession date kya hai?\nAgent: Dec 2027\nLead: thoda late hai..."}
              {...form.register("message")}
            />
            <p className="text-right text-xs text-muted-foreground">{messageLength} / 6000</p>
            {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Analysing with AI (about 5 s)…
              </>
            ) : (
              "Save and analyse"
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
