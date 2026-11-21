"""
# call_queue.py - the Call Loop's business rules: who to call next, speed-to-lead timers, what a call changed

- Plain functions, no AI and no database, so every rule is exact and unit-tested.
- Speed-to-lead: a new Hot lead should get a call within 5 minutes, Warm within an hour, Cold within a day.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.scoring import SIGNAL_LABELS
from app.schemas import LeadAnalysis, SignalChange

SLA_MINUTES = {"hot": 5, "warm": 60, "cold": 24 * 60}
TIER_ORDER = {"hot": 0, "warm": 1, "cold": 2, "junk": 3}
BUCKET_ORDER = {"overdue": 0, "follow_up_due": 1, "new": 2, "scheduled": 3}
FOLLOW_UP_DELAY = {
    "now": timedelta(hours=1),
    "today": timedelta(hours=4),
    "this_week": timedelta(days=3),
    "later": timedelta(days=14),
}
NO_ANSWER_RETRY = timedelta(hours=2)


@dataclass
class QueueLead:
    """The fields of a lead the queue rules need."""

    id: str
    tier: str | None
    score: int | None
    status: str
    stage: str
    created_at: datetime
    first_contact_at: datetime | None
    next_follow_up_at: datetime | None


def sla_minutes(lead: QueueLead) -> int | None:
    """Minutes allowed before first contact; None once contacted, for junk, or before analysis finishes."""
    if lead.first_contact_at or lead.status != "ready":
        return None
    return SLA_MINUTES.get(lead.tier or "")


def bucket(lead: QueueLead, now: datetime) -> str:
    """Why a lead is in the queue: overdue new lead, follow-up due, fresh new lead, or follow-up scheduled later."""
    limit = sla_minutes(lead)
    if limit is not None:
        return "overdue" if now - lead.created_at > timedelta(minutes=limit) else "new"
    due = lead.next_follow_up_at is not None and lead.next_follow_up_at <= now
    return "follow_up_due" if due else "scheduled"


def order_queue(leads: list[QueueLead], now: datetime) -> list[tuple[QueueLead, str]]:
    """Today's calls: hotter leads first; inside a tier overdue, then due follow-ups, then fresh leads, by score.
    Follow-ups scheduled for later always go to the bottom."""
    callable_leads = [
        l for l in leads if l.status == "ready" and l.tier != "junk" and l.stage != "closed_lost"
    ]
    entries = [(l, bucket(l, now)) for l in callable_leads]

    def key(entry: tuple[QueueLead, str]) -> tuple:
        lead, b = entry
        follow_up = lead.next_follow_up_at.timestamp() if lead.next_follow_up_at else float("inf")
        within = follow_up if b in ("follow_up_due", "scheduled") else -(lead.score or 0)
        return (
            b == "scheduled",
            TIER_ORDER.get(lead.tier or "junk", 3),
            BUCKET_ORDER[b],
            within,
            lead.created_at,
        )

    return sorted(entries, key=key)


def follow_up_at(when: str, now: datetime) -> datetime:
    """Turn the AI's suggested timing ("today", "this_week"...) into a concrete time."""
    return now + FOLLOW_UP_DELAY[when]


def diff_signals(before: LeadAnalysis | None, after: LeadAnalysis) -> list[SignalChange]:
    """The signals whose level changed between two analyses, with the new evidence. Computed in code, not by the AI."""
    if before is None:
        return []
    changes = []
    for name, label in SIGNAL_LABELS.items():
        old, new = getattr(before.signals, name), getattr(after.signals, name)
        if old.level != new.level:
            changes.append(SignalChange(signal=label, from_=old.level, to=new.level, evidence=new.evidence))
    return changes
