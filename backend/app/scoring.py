"""
# scoring.py - turns the AI's signal levels into a 0-100 lead score and a Hot / Warm / Cold / Junk tier

- Plain code, no AI: the same signals always give the same score, and every point traces to a quoted phrase.
- The AI reads the messy text; this file does the arithmetic. A customer writing "mark me hot" cannot change it.
- WEIGHTS and CAPS are the one place to tune scoring for a client. Each signal's best level adds up to 100.
"""

from datetime import datetime
from typing import Literal

from app.schemas import LeadAnalysis, Reason

Tier = Literal["hot", "warm", "cold", "junk"]

WEIGHTS: dict[str, dict[str, int]] = {
    "timeline": {
        "under_1_month": 20,
        "1_3_months": 14,
        "3_6_months": 8,
        "over_6_months": 4,
        "browsing": 0,
        "unknown": 5,
    },
    "budget": {"clear_realistic": 20, "stretch": 12, "likely_unrealistic": 2, "unknown": 6},
    "intent": {"ready_to_act": 20, "specific_questions": 12, "generic": 5, "just_checking": 1},
    "specificity": {"specific": 15, "partial": 10, "vague": 3},
    "financing": {"ready": 15, "planned": 9, "uncertain": 4, "unknown": 5},
    "decision_maker": {"confirmed": 10, "needs_approval": 6, "proxy": 2, "unknown": 5},
}

SIGNAL_LABELS = {
    "timeline": "Timeline",
    "budget": "Budget",
    "intent": "Intent",
    "specificity": "Requirement",
    "financing": "Financing",
    "decision_maker": "Decision-maker",
}

# Score ceilings: whatever the other signals add up to, these answers keep a lead out of a higher tier.
CAPS = [
    ("budget", "likely_unrealistic", 44),  # can't afford what they ask: re-qualify first
    ("timeline", "3_6_months", 69),  # Hot means buying soon; 3-6 months is at most Warm
    ("timeline", "over_6_months", 44),  # not a call-today lead
    ("timeline", "browsing", 44),
    ("intent", "just_checking", 44),  # they say they're only checking
]

MAJOR_OBJECTION_PENALTY = 5
MAX_OBJECTION_PENALTY = 10
WRONG_INTENT_CAP = 25


def tier_for(score: int) -> Tier:
    """Map a score to its tier: Hot 70+, Warm 45-69, Cold 20-44, Junk below 20."""
    if score >= 70:
        return "hot"
    if score >= 45:
        return "warm"
    if score >= 20:
        return "cold"
    return "junk"


def score_lead(analysis: LeadAnalysis) -> tuple[int, Tier, list[Reason]]:
    """Add up the points per signal, apply the objection penalty and caps, and explain every point."""
    reasons = []
    for signal, table in WEIGHTS.items():
        found = getattr(analysis.signals, signal)
        reasons.append(
            Reason(
                signal=signal,
                level=found.level,
                points=table.get(found.level, 0),
                max=max(table.values()),
                evidence=found.evidence,
            )
        )
    reasons.sort(key=lambda r: r.points, reverse=True)

    if analysis.category in ("not_a_buyer", "channel_partner"):
        return 0, "junk", reasons

    majors = sum(o.severity == "major" for o in analysis.objections)
    score = sum(r.points for r in reasons) - min(majors * MAJOR_OBJECTION_PENALTY, MAX_OBJECTION_PENALTY)
    if analysis.category == "wrong_intent":
        score = min(score, WRONG_INTENT_CAP)
    for signal, level, cap in CAPS:
        if getattr(analysis.signals, signal).level == level:
            score = min(score, cap)
    score = max(0, min(100, score))
    return score, tier_for(score), reasons


def timeline_points(analysis: LeadAnalysis | None) -> int:
    """Timeline points a lead earned; breaks ties between equal scores."""
    return WEIGHTS["timeline"].get(analysis.signals.timeline.level, 0) if analysis else 0


def sort_key(score: int | None, analysis: LeadAnalysis | None, created_at: datetime) -> tuple:
    """List order: higher score first, then the more urgent timeline, then the newer lead."""
    return (-(score or 0), -timeline_points(analysis), -created_at.timestamp())
