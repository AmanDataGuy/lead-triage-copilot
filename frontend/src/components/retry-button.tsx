"use client";
/**
 * # retry-button.tsx - runs the AI analysis again for a lead whose first attempt failed
 */
import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryAnalysis } from "@/app/actions";

// Retry the analysis and report any error as a toast.
export function RetryButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { error } = await retryAnalysis(leadId);
          if (error) toast.error(error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {pending ? "Analysing…" : "Retry analysis"}
    </Button>
  );
}
