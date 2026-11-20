/**
 * # analysis-view.tsx - the AI analysis laid out so a salesperson can act in seconds
 *
 * - Order: next action (loudest), summary, requirements, objections, things to check, suggested reply,
 *   then the details on demand: why this score, intent, the original message.
 * - All AI text is rendered as plain text (React escapes it); nothing the model writes is treated as HTML.
 */
import { AlertTriangle, ChevronDown, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ReplyBox } from "@/components/reply-box";
import type { LeadAnalysis } from "@/lib/ai/schema";
import type { Lead } from "@/lib/db";
import { SIGNAL_LABELS, type Reason } from "@/lib/scoring";
import { humanize } from "@/lib/format";

export const ACTION_LABEL: Record<LeadAnalysis["nextAction"]["action"], string> = {
  call_now: "Call now",
  book_site_visit: "Book a site visit",
  send_details: "Send details",
  clarify_budget: "Clarify budget",
  nurture: "Nurture",
  reroute: "Re-route",
  disqualify: "Disqualify",
};
const WHEN_LABEL: Record<LeadAnalysis["nextAction"]["when"], string> = {
  now: "now",
  today: "today",
  this_week: "this week",
  later: "later",
};

// Show one lead's analysis, most actionable part first.
export function AnalysisView({ lead, analysis, reasons }: { lead: Lead; analysis: LeadAnalysis; reasons: Reason[] }) {
  const { nextAction } = analysis;
  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5" aria-live="polite">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Target className="size-4" aria-hidden /> Next action
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">
            {ACTION_LABEL[nextAction.action]} <span className="font-normal text-muted-foreground">({WHEN_LABEL[nextAction.when]})</span>
          </p>
          <p>{nextAction.detail}</p>
        </CardContent>
      </Card>

      <p className="text-base">{analysis.summary}</p>

      <div className="flex flex-wrap gap-1.5">
        {analysis.category !== "buyer" && <Badge variant="destructive">{humanize(analysis.category)}</Badge>}
        {analysis.inputQuality === "thin" && <Badge variant="secondary">Needs more info</Badge>}
        {analysis.keyRequirements.map((r) => (
          <Badge key={r} variant="secondary">
            {r}
          </Badge>
        ))}
      </div>

      <section>
        <h3 className="mb-1.5 text-sm font-semibold">Objections</h3>
        {analysis.objections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No objections raised.</p>
        ) : (
          <ul className="space-y-2">
            {analysis.objections.map((o) => (
              <li key={o.concern} className="text-sm">
                <span className="font-medium">
                  {o.severity === "major" && <Badge variant="destructive" className="mr-1.5">major</Badge>}
                  {o.concern}
                </span>
                <span className="block text-muted-foreground">→ {o.handling}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {analysis.contradictions.length > 0 && (
        <section className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <h3 className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" aria-hidden /> Check before you call
          </h3>
          <ul className="list-disc pl-5">
            {analysis.contradictions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <ReplyBox text={analysis.suggestedResponse} phone={lead.phone} />

      <Details title="Why this score?">
        <ul className="space-y-1.5 text-sm">
          {reasons.map((r) => (
            <li key={r.signal} className="flex gap-2">
              <span className="w-14 shrink-0 font-mono tabular-nums">
                +{r.points}/{r.max}
              </span>
              <span>
                <span className="font-medium">{SIGNAL_LABELS[r.signal]}:</span> {humanize(r.level)}
                {r.evidence && r.evidence !== "not stated" && <span className="text-muted-foreground"> &ldquo;{r.evidence}&rdquo;</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Each major objection takes off 5 points (at most 10). Some answers cap the score: an unrealistic budget,
          6+ months away or &ldquo;just checking&rdquo; keep a lead Cold; 3-6 months keeps it at most Warm. Spam and
          broker enquiries score 0. The AI picks each level and quotes its evidence; the points come from a fixed table.
        </p>
      </Details>

      <Details title="Intent and original message">
        <p className="text-sm">
          <span className="font-medium">Intent:</span> {humanize(analysis.intent.type)}. {analysis.intent.explanation}
        </p>
        {analysis.missingInfo.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="font-medium">Still unknown:</span> {analysis.missingInfo.join(" · ")}
          </p>
        )}
        <pre className="mt-2 rounded-md bg-muted p-3 font-sans text-sm whitespace-pre-wrap">{lead.message || "(no message)"}</pre>
        {lead.callNotes && (
          <pre className="mt-2 rounded-md bg-muted p-3 font-sans text-sm whitespace-pre-wrap">{lead.callNotes}</pre>
        )}
      </Details>
    </div>
  );
}

// A section that stays closed until the salesperson wants the detail.
function Details({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
        {title}
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
