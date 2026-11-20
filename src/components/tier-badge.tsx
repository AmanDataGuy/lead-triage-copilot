/**
 * # tier-badge.tsx - the Hot / Warm / Cold / Junk label with its score
 *
 * - Icon + word + colour, never colour alone, and a full sentence for screen readers.
 */
import { Ban, Flame, Snowflake, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/types";

export const TIER_STYLE: Record<Tier, { label: string; Icon: typeof Flame; className: string }> = {
  hot: { label: "Hot", Icon: Flame, className: "border-red-200 bg-red-50 text-red-800" },
  warm: { label: "Warm", Icon: Sun, className: "border-amber-200 bg-amber-50 text-amber-900" },
  cold: { label: "Cold", Icon: Snowflake, className: "border-sky-200 bg-sky-50 text-sky-900" },
  junk: { label: "Junk", Icon: Ban, className: "border-slate-200 bg-slate-100 text-slate-700" },
};

// Show a lead's tier and score as one compact badge.
export function TierBadge({ tier, score, className }: { tier: Tier; score: number | null; className?: string }) {
  const { label, Icon, className: tierClass } = TIER_STYLE[tier];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-mono tabular-nums", tierClass, className)}
      aria-label={`${label} lead, score ${score ?? 0} out of 100`}
    >
      <Icon aria-hidden />
      {label} {score}
    </Badge>
  );
}
