/**
 * # page.tsx (/leads/[id]) - one lead: the AI analysis, the Call tab (own feature) and the follow-up chat
 *
 * - The API only returns the lead if it belongs to this browser's workspace; anything else is a 404.
 * - Shows an error passed back by createLead (e.g. AI quota) and a Retry button for failed analyses.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalysisView } from "@/components/analysis-view";
import { CallTab } from "@/components/call-tab";
import { ChatPanel } from "@/components/chat-panel";
import { RetryButton } from "@/components/retry-button";
import { TierBadge } from "@/components/tier-badge";
import { api } from "@/lib/api";
import type { Activity, Lead } from "@/lib/types";
import { deleteLead } from "@/app/actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> };

// Render one lead with its three tabs.
export default async function LeadPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;
  const res = await api<{ lead: Lead; activities: Activity[]; messages: UIMessage[] }>(
    `/api/leads/${encodeURIComponent(id)}`,
  );
  if (res.status === 404 || res.status === 422) notFound();
  if (!res.ok) throw new Error("The lead service is unavailable. Please refresh in a moment.");
  const { lead, activities, messages } = res.data;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground md:hidden">
          <ArrowLeft className="size-4" aria-hidden /> All leads
        </Link>

        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <h2 className="text-xl font-semibold">{lead.name}</h2>
          {lead.status === "ready" && lead.tier && <TierBadge tier={lead.tier} score={lead.score} className="mt-1" />}
          <form action={deleteLead.bind(null, lead.id)} className="ml-auto">
            <Button variant="ghost" size="sm" type="submit" aria-label="Delete lead">
              <Trash2 aria-hidden />
            </Button>
          </form>
          <p className="w-full text-sm text-muted-foreground">
            {lead.location} · {lead.requirement} · {lead.budget} · {lead.timeline}
            {lead.phone && ` · ${lead.phone}`}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>The lead was saved, but the AI step didn&apos;t finish</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lead.status !== "ready" || !lead.analysis ? (
          <Alert>
            <AlertTitle>{lead.status === "analyzing" ? "Analysis in progress" : "Not analysed yet"}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>Your input is saved. Run the AI analysis again when you&apos;re ready.</p>
              <RetryButton leadId={lead.id} />
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs defaultValue="analysis">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="call">Call</TabsTrigger>
              <TabsTrigger value="chat">Ask AI</TabsTrigger>
            </TabsList>
            <TabsContent value="analysis" className="mt-4">
              <AnalysisView lead={lead} analysis={lead.analysis} reasons={lead.reasons ?? []} />
            </TabsContent>
            <TabsContent value="call" className="mt-4">
              <CallTab leadId={lead.id} phone={lead.phone} analysis={lead.analysis} activities={activities} />
            </TabsContent>
            <TabsContent value="chat" className="mt-4">
              <ChatPanel leadId={lead.id} phone={lead.phone} initialMessages={messages} />
            </TabsContent>
          </Tabs>
        )}

        {lead.model && (
          <p className="text-xs text-muted-foreground">
            Analysed by {lead.model}. The score is calculated from the AI&apos;s evidence by fixed rules, not chosen
            by the AI.
          </p>
        )}
      </div>
    </main>
  );
}
