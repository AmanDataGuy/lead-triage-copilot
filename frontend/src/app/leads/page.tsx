/**
 * # page.tsx (/leads) - the right-hand pane before any lead is opened (desktop only; phones show the list)
 */

// A short hint telling the salesperson where to start.
export default function NoLeadSelected() {
  return (
    <main className="hidden flex-1 items-center justify-center p-8 text-center text-muted-foreground md:flex">
      <p className="max-w-sm">
        Pick a lead on the left. The <strong>Call queue</strong> shows who to call next; the{" "}
        <strong>All leads</strong> tab groups everyone by priority.
      </p>
    </main>
  );
}
