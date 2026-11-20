"""
# run_golden.py - how often does the AI + scoring rules agree with a human on everyday leads?

- Loads 32 hand-labelled leads from golden_leads.yaml (pydantic-evals format) and runs each one RUNS times through the
  real pipeline: AI analysis, then the score and tier from scoring.py.
- Reports: exact tier accuracy, accuracy within one tier, consistency (same tier on every run), a confusion table
  (expected vs predicted), every miss with the AI's signal levels, and which model answered.
- Writes the results to golden_results.md so the latest numbers are kept with the code.
- Run: `uv run --env-file ../.env python -m evals.run_golden` (about 64 AI calls; not part of CI).
"""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import median
from types import SimpleNamespace
from typing import Any

from pydantic_evals import Dataset
from pydantic_evals.evaluators import Evaluator, EvaluatorContext

from app.ai import analyze_lead
from app.scoring import score_lead

RUNS = 2
TIERS = ["hot", "warm", "cold", "junk"]
HERE = Path(__file__).parent


async def classify(inputs: dict) -> dict:
    """The task under test: analyse a lead with the real AI, then score it in code."""
    analysis, model = await analyze_lead(SimpleNamespace(**inputs, call_notes=""))
    score, tier, _ = score_lead(analysis)
    signals = {name: getattr(analysis.signals, name).level for name in type(analysis.signals).model_fields}
    return {"tier": tier, "score": score, "category": analysis.category, "model": model, "signals": signals}


@dataclass
class TierMatches(Evaluator):
    """The predicted tier is exactly the human label."""

    def evaluate(self, ctx: EvaluatorContext) -> bool:
        return ctx.output["tier"] == ctx.expected_output


@dataclass
class WithinOneTier(Evaluator):
    """The predicted tier is the label or a neighbouring tier (e.g. warm instead of hot)."""

    def evaluate(self, ctx: EvaluatorContext) -> bool:
        return abs(TIERS.index(ctx.output["tier"]) - TIERS.index(ctx.expected_output)) <= 1


def summarise(report) -> str:
    """Turn the pydantic-evals report into the markdown summary: accuracy, consistency, confusion table, misses."""
    runs = report.cases
    by_case: dict[str, list] = defaultdict(list)
    for r in runs:
        by_case[r.source_case_name or r.name].append(r)

    exact = sum(r.output["tier"] == r.expected_output for r in runs)
    near = sum(abs(TIERS.index(r.output["tier"]) - TIERS.index(r.expected_output)) <= 1 for r in runs)
    consistent = sum(len({r.output["tier"] for r in rs}) == 1 for rs in by_case.values())
    models = Counter(r.output["model"] for r in runs)
    seconds = median(r.task_duration for r in runs)
    confusion = Counter((r.expected_output, r.output["tier"]) for r in runs)
    n = len(runs)

    lines = [
        "# Golden set results",
        "",
        (
            f"Run {datetime.now(UTC):%Y-%m-%d %H:%M} UTC · {len(by_case)} hand-labelled leads × {RUNS} runs = {n} analyses"
            f" · failed runs: {len(report.failures)}"
        ),
        "",
        "| Metric | Result |",
        "|---|---|",
        f"| Exact tier matches the human label | **{exact}/{n} ({exact / n:.0%})** |",
        f"| Within one tier | {near}/{n} ({near / n:.0%}) |",
        f"| Same tier on every run | {consistent}/{len(by_case)} leads |",
        f"| Median time per analysis | {seconds:.1f} s |",
        f"| Model that answered | {', '.join(f'{m}: {c}' for m, c in models.items())} |",
        "",
        "## Confusion table (rows = human label, columns = predicted)",
        "",
        "| label \\ predicted | " + " | ".join(TIERS) + " | total |",
        "|---|" + "---|" * (len(TIERS) + 1),
    ]
    for expected in TIERS:
        row = [confusion[(expected, predicted)] for predicted in TIERS]
        lines.append(f"| **{expected}** | " + " | ".join(str(c) for c in row) + f" | {sum(row)} |")

    misses = [
        (name, rs) for name, rs in by_case.items() if any(r.output["tier"] != r.expected_output for r in rs)
    ]
    lines += ["", f"## Misses ({len(misses)} leads)", ""]
    if not misses:
        lines.append("None.")
    for name, rs in misses:
        got = ", ".join(f"{r.output['tier']} {r.output['score']}" for r in rs)
        signals = " ".join(f"{k}={v}" for k, v in rs[0].output["signals"].items())
        lines.append(f"- **{name}**: labelled {rs[0].expected_output}, got {got}. Signals: {signals}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    dataset = Dataset[dict, Any, dict].from_file(HERE / "golden_leads.yaml")
    dataset.add_evaluator(TierMatches())
    dataset.add_evaluator(WithinOneTier())
    report = dataset.evaluate_sync(classify, repeat=RUNS, max_concurrency=2, progress=False)
    for failure in report.failures:
        print("FAILED:", failure.name, failure.error_message[:200])
    summary = summarise(report)
    (HERE / "golden_results.md").write_text(summary)
    print(summary)
