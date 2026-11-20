"""
# conftest.py - shared test helpers: build a valid LeadAnalysis with any signal levels or fields changed
"""

from app.schemas import LeadAnalysis

BEST = {
    "timeline": "under_1_month",
    "budget": "clear_realistic",
    "intent": "ready_to_act",
    "specificity": "specific",
    "financing": "ready",
    "decision_maker": "confirmed",
}


def make_analysis(levels: dict | None = None, **fields) -> LeadAnalysis:
    """A complete, valid analysis; pass signal levels or top-level fields to change what a test needs."""
    levels = {
        "timeline": "unknown",
        "budget": "unknown",
        "intent": "generic",
        "specificity": "partial",
        "financing": "unknown",
        "decision_maker": "unknown",
        **(levels or {}),
    }
    data = {
        "category": "buyer",
        "input_quality": "ok",
        "summary": "Wants a 2BHK in Whitefield soon.",
        "intent": {"type": "self_use", "explanation": "Buying a home to live in."},
        "key_requirements": ["2BHK", "Whitefield"],
        "objections": [],
        "contradictions": [],
        "missing_info": [],
        "signals": {k: {"level": v, "evidence": f"quote for {v}"} for k, v in levels.items()},
        "next_action": {"action": "call_now", "when": "now", "detail": "Call and confirm the site visit."},
        "call_brief": {
            "opener": "Hi!",
            "emphasize": ["Ready to move"],
            "objection_reply": "We can check that.",
        },
        "suggested_response": "Hello, thanks for reaching out.",
        "language": "english",
        **fields,
    }
    return LeadAnalysis.model_validate(data)
