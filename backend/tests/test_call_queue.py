"""
# test_call_queue.py - pins the Call Loop rules: speed-to-lead timers, call order, and what a call changed
"""

from datetime import UTC, datetime, timedelta

from app.call_queue import QueueLead, bucket, diff_signals, follow_up_at, order_queue, sla_minutes
from tests.conftest import make_analysis

NOW = datetime(2026, 11, 21, 10, 0, tzinfo=UTC)


def mins_ago(m: int) -> datetime:
    return NOW - timedelta(minutes=m)


def lead(id: str, **over) -> QueueLead:
    base = {
        "id": id,
        "tier": "warm",
        "score": 50,
        "status": "ready",
        "stage": "new",
        "created_at": mins_ago(10),
        "first_contact_at": None,
        "next_follow_up_at": None,
    }
    return QueueLead(**{**base, **over})


def ids(leads: list[QueueLead]) -> list[str]:
    return [l.id for l, _ in order_queue(leads, NOW)]


def test_hot_lead_is_overdue_after_5_minutes():
    assert bucket(lead("a", tier="hot", created_at=mins_ago(4)), NOW) == "new"
    assert bucket(lead("a", tier="hot", created_at=mins_ago(6)), NOW) == "overdue"


def test_timer_stops_once_contacted_and_never_runs_for_junk():
    assert sla_minutes(lead("a", first_contact_at=mins_ago(1))) is None
    assert sla_minutes(lead("a", tier="junk")) is None


def test_queue_order_within_a_tier_and_exclusions():
    leads = [
        lead("scheduled", first_contact_at=mins_ago(60), next_follow_up_at=NOW + timedelta(minutes=30)),
        lead("fresh-warm", created_at=mins_ago(5)),
        lead("followup", first_contact_at=mins_ago(60), next_follow_up_at=mins_ago(1)),
        lead("overdue-hot", tier="hot", score=80, created_at=mins_ago(12)),
        lead("junk", tier="junk", score=0),
        lead("lost", stage="closed_lost"),
        lead("analysing", status="analyzing"),
    ]
    assert ids(leads) == ["overdue-hot", "followup", "fresh-warm", "scheduled"]


def test_cold_lead_never_sits_above_a_hot_one():
    leads = [
        lead("cold-overdue", tier="cold", score=30, created_at=mins_ago(3000)),
        lead("hot-fresh", tier="hot", score=90, created_at=mins_ago(2)),
        lead("warm-overdue", tier="warm", score=60, created_at=mins_ago(120)),
    ]
    assert ids(leads) == ["hot-fresh", "warm-overdue", "cold-overdue"]


def test_follow_up_time_comes_from_the_ai_timing():
    assert follow_up_at("today", NOW) == NOW + timedelta(hours=4)


def test_diff_lists_only_changed_signals_with_new_evidence():
    before = make_analysis({"financing": "uncertain"})
    after = make_analysis({"financing": "ready"})
    changes = diff_signals(before, after)
    assert [(c.signal, c.from_, c.to, c.evidence) for c in changes] == [
        ("Financing", "uncertain", "ready", "quote for ready")
    ]
    assert diff_signals(None, after) == []
