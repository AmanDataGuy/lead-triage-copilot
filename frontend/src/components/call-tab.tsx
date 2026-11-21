"use client";
/**
 * # call-tab.tsx - the Call Loop's "during" and "after" steps for one lead
 *
 * - Call brief: opener, points to stress, questions to ask, likely objection. It was written in the same AI call as
 *   the analysis, so opening it costs nothing.
 * - Log call: pick an outcome and type what happened. Real conversations are re-analysed, so the
 *   score, next step and follow-up draft update; the history shows exactly which signals changed and why.
 */
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReplyBox } from "@/components/reply-box";
import type { Activity, LeadAnalysis } from "@/lib/types";
import { CALL_OUTCOMES, type CallOutcome } from "@/lib/validation";
import { humanize } from "@/lib/format";
import { logCall } from "@/app/actions";

const OUTCOME_TEXT: Record<CallOutcome, string> = {
  no_answer: "No answer",
  connected: "Connected",
  visit_booked: "Site visit booked",
  not_interested: "Not interested",
};

type Props = { leadId: string; phone: string; analysis: LeadAnalysis; activities: Activity[] };

// The call brief, the log-call form and the call history.
export function CallTab({ leadId, phone, analysis, activities }: Props) {
  const { callBrief, missingInfo, objections } = analysis;
  const mainObjection = objections.find((o) => o.severity === "major") ?? objections[0];
  const lastCall = activities[0];
  const scoreChanged = lastCall && lastCall.scoreBefore !== lastCall.scoreAfter;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Call brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-base">
          <p className="text-lg">&ldquo;{callBrief.opener}&rdquo;</p>
          <BriefList title="Stress" items={callBrief.emphasize} />
          {missingInfo.length > 0 && <BriefList title="Ask" items={missingInfo} />}
          {mainObjection && (
            <div>
              <p className="text-sm font-semibold text-muted-foreground">If they say: {mainObjection.concern}</p>
              <p>→ {callBrief.objectionReply}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <LogCallForm leadId={leadId} />

      {scoreChanged && (
        <ReplyBox title="Follow-up draft (updated after your call)" text={analysis.suggestedResponse} phone={phone} />
      )}

      {activities.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Call history</h3>
          <ol className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{OUTCOME_TEXT[a.outcome as CallOutcome] ?? a.outcome}</Badge>
                  <span className="text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  {a.scoreBefore !== a.scoreAfter && (
                    <span className="ml-auto inline-flex items-center gap-1 font-mono font-semibold tabular-nums">
                      {a.scoreBefore} <ArrowRight className="size-3.5" aria-label="to" /> {a.scoreAfter}
                    </span>
                  )}
                </div>
                {a.note && <p className="mt-1.5">{a.note}</p>}
                {a.changes.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                    {a.changes.map((c) => (
                      <li key={c.signal}>
                        {c.signal}: {humanize(c.from)} → <span className="text-foreground">{humanize(c.to)}</span>
                        {c.evidence !== "not stated" && <> (&ldquo;{c.evidence}&rdquo;)</>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted-foreground">{title}</p>
      <ul className="list-disc pl-5">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

// Pick a call outcome, add notes, and save; shows the score change when the AI re-scores the lead.
function LogCallForm({ leadId }: { leadId: string }) {
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const needsAi = outcome === "connected" || outcome === "visit_booked";

  const submit = () =>
    startTransition(async () => {
      const result = await logCall({ leadId, outcome, note });
      if (result.fieldErrors) return void toast.error(Object.values(result.fieldErrors).flat()[0] ?? "Check the form");
      if (result.error) toast.error(result.error);
      else if (result.scoreBefore !== result.scoreAfter) toast.success(`Score ${result.scoreBefore} → ${result.scoreAfter}`);
      else toast.success("Call logged");
      setNote("");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log call</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="radiogroup" aria-label="Call outcome" className="flex flex-wrap gap-2">
          {CALL_OUTCOMES.map((o) => (
            <Button
              key={o}
              type="button"
              role="radio"
              aria-checked={outcome === o}
              variant={outcome === o ? "default" : "outline"}
              size="sm"
              onClick={() => setOutcome(o)}
            >
              {OUTCOME_TEXT[o]}
            </Button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="call-note">What happened?</Label>
          <Textarea
            id="call-note"
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. HDFC loan sanctioned last week. Wife will join the Saturday 11am visit. Wants east-facing only."
          />
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? (needsAi ? "Updating the analysis…" : "Saving…") : "Save call"}
        </Button>
        {needsAi && (
          <p className="text-xs text-muted-foreground">
            Your notes are added to the lead and the AI re-reads everything, so the score and next step stay current.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
