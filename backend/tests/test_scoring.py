"""
# test_scoring.py - pins the lead-scoring rules so a weight change is always a deliberate one
"""

from app.domain.scoring import WEIGHTS, score_lead, tier_for
from tests.conftest import BEST, make_analysis

MAJOR = {"concern": "x", "severity": "major", "handling": "y"}
MINOR = {**MAJOR, "severity": "minor"}


def test_best_lead_scores_100_and_is_hot():
    assert score_lead(make_analysis(BEST))[:2] == (100, "hot")


def test_signal_maximums_add_up_to_100():
    assert sum(max(levels.values()) for levels in WEIGHTS.values()) == 100


def test_major_objection_costs_5_points_capped_at_10():
    assert score_lead(make_analysis(BEST, objections=[MAJOR]))[0] == 95
    assert score_lead(make_analysis(BEST, objections=[MAJOR] * 3))[0] == 90
    assert score_lead(make_analysis(BEST, objections=[MINOR] * 2))[0] == 100


def test_spam_and_brokers_are_junk_whatever_the_signals_say():
    for category in ("not_a_buyer", "channel_partner"):
        assert score_lead(make_analysis(BEST, category=category))[:2] == (0, "junk")


def test_sellers_and_renters_are_capped_at_25():
    assert score_lead(make_analysis(BEST, category="wrong_intent"))[:2] == (25, "cold")


def test_unrealistic_budget_keeps_even_an_urgent_lead_cold():
    assert score_lead(make_analysis({**BEST, "budget": "likely_unrealistic"}))[:2] == (44, "cold")


def test_hot_means_buying_within_three_months():
    assert score_lead(make_analysis({**BEST, "timeline": "3_6_months"}))[:2] == (69, "warm")
    assert score_lead(make_analysis({**BEST, "timeline": "over_6_months"}))[1] == "cold"
    assert score_lead(make_analysis({**BEST, "timeline": "1_3_months"}))[1] == "hot"


def test_just_checking_stays_cold_even_if_the_form_claims_urgency():
    assert score_lead(make_analysis({**BEST, "intent": "just_checking"}))[1] == "cold"


def test_reasons_explain_every_point_biggest_first():
    _, _, reasons = score_lead(make_analysis({**BEST, "decision_maker": "needs_approval"}))
    assert len(reasons) == 6
    assert [r.points for r in reasons] == sorted((r.points for r in reasons), reverse=True)
    assert reasons[-1].signal == "decision_maker" and reasons[-1].points == 6 and reasons[-1].max == 10
    assert reasons[0].evidence.startswith("quote for")


def test_tier_boundaries():
    assert [tier_for(s) for s in (19, 20, 44, 45, 69, 70, 100)] == [
        "junk",
        "cold",
        "cold",
        "warm",
        "warm",
        "hot",
        "hot",
    ]


def test_hot_means_asking_to_act_not_just_asking_questions():
    asking = make_analysis({**BEST, "intent": "specific_questions"})
    assert score_lead(asking)[:2] == (69, "warm")
    assert score_lead(make_analysis({**BEST, "intent": "generic"}))[1] == "warm"
