"""
# schemas.py - the shapes of data going in and out: the intake form, the AI's analysis, and API responses

- LeadAnalysis is what the AI must return. The model only picks levels from fixed lists and quotes evidence;
  scoring.py turns those levels into the score, so the score is repeatable and explainable.
- Python uses snake_case; JSON (API, database, and the schema the AI sees) uses camelCase, via CamelModel.
- Word limits are in field descriptions, not max_length: Gemini ignores string limits, so long text is trimmed in code.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that reads and writes camelCase JSON."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


TIMELINES = ("Immediately", "Within 1 month", "1-3 months", "3-6 months", "6+ months", "Just exploring")
CallOutcome = Literal["no_answer", "connected", "visit_booked", "not_interested"]


class LeadInput(CamelModel):
    """The intake form a salesperson fills in."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True, extra="forbid"
    )

    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=20, pattern=r"^[+\d\s()-]*$")
    location: str = Field(min_length=1, max_length=200)
    requirement: str = Field(min_length=1, max_length=200)
    budget: str = Field(min_length=1, max_length=200)
    timeline: Literal[TIMELINES]  # type: ignore[valid-type]
    message: str = Field(default="", max_length=6000)


class LogCallInput(CamelModel):
    """What the salesperson records after a call."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True, extra="forbid"
    )

    outcome: CallOutcome
    note: str = Field(default="", max_length=2000)


class ChatInput(CamelModel):
    """One new chat message from the salesperson."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True, extra="forbid"
    )

    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=1000)


class ReplyInput(CamelModel):
    """A reply the salesperson approved from the chat."""

    text: str = Field(min_length=1, max_length=1500)


# ---- What the AI returns ------------------------------------------------------------------------------------

Evidence = Field(
    description='Short verbatim quote from the lead (max 12 words) that supports this level, or "not stated"'
)


class TimelineSignal(CamelModel):
    level: Literal["under_1_month", "1_3_months", "3_6_months", "over_6_months", "browsing", "unknown"] = (
        Field(description="How soon they plan to buy")
    )
    evidence: str = Evidence


class BudgetSignal(CamelModel):
    level: Literal["clear_realistic", "stretch", "likely_unrealistic", "unknown"] = Field(
        description="clear_realistic = a stated figure that plausibly fits the requirement and location; "
        "likely_unrealistic = clearly too low for what they ask"
    )
    evidence: str = Evidence


class IntentSignal(CamelModel):
    level: Literal["ready_to_act", "specific_questions", "generic", "just_checking"] = Field(
        description="ready_to_act = asks for a site visit, price sheet, booking or token; specific_questions = asks "
        "about possession, carpet area, amenities; generic = 'send details'; just_checking = browsing"
    )
    evidence: str = Evidence


class SpecificitySignal(CamelModel):
    level: Literal["specific", "partial", "vague"] = Field(
        description="specific = configuration plus micro-location or project plus a must-have; "
        "partial = configuration plus area; vague = 'a flat anywhere'"
    )
    evidence: str = Evidence


class FinancingSignal(CamelModel):
    level: Literal["ready", "planned", "uncertain", "unknown"] = Field(
        description="ready = loan sanctioned or own funds ready; planned = intends a loan or sale proceeds; "
        "uncertain = unsure if they qualify"
    )
    evidence: str = Evidence


class DecisionMakerSignal(CamelModel):
    level: Literal["confirmed", "needs_approval", "proxy", "unknown"] = Field(
        description="confirmed = decides alone or all deciders are involved; needs_approval = needs a spouse or "
        "parent to agree; proxy = enquiring for someone else"
    )
    evidence: str = Evidence


class Signals(CamelModel):
    timeline: TimelineSignal
    budget: BudgetSignal
    intent: IntentSignal
    specificity: SpecificitySignal
    financing: FinancingSignal
    decision_maker: DecisionMakerSignal


class Intent(CamelModel):
    type: Literal["self_use", "investment", "rent", "browsing", "selling", "unclear"]
    explanation: str = Field(description="One sentence, max 20 words")


class Objection(CamelModel):
    concern: str = Field(description="The customer's concern in max 12 words")
    severity: Literal["minor", "major"]
    handling: str = Field(description="How the salesperson can answer it, max 20 words, no invented facts")


class NextAction(CamelModel):
    action: Literal[
        "call_now", "book_site_visit", "send_details", "clarify_budget", "nurture", "reroute", "disqualify"
    ]
    when: Literal["now", "today", "this_week", "later"]
    detail: str = Field(description="The concrete next step in one sentence, max 20 words")


class CallBrief(CamelModel):
    opener: str = Field(description="First line to say on the call, personal to this lead, max 25 words")
    emphasize: list[str] = Field(
        min_length=1, max_length=3, description="Points to stress on the call, max 12 words each"
    )
    objection_reply: str = Field(
        description="One-line answer to the most likely objection, max 25 words, no invented prices or facts"
    )


class LeadAnalysis(CamelModel):
    """Everything the AI says about one lead."""

    category: Literal["buyer", "wrong_intent", "channel_partner", "not_a_buyer"] = Field(
        description="buyer = wants to buy; wrong_intent = wants to sell or rent instead; channel_partner = a broker "
        "asking for inventory or commission; not_a_buyer = spam, vendor pitch, job seeker, gibberish"
    )
    input_quality: Literal["ok", "thin"] = Field(
        description="thin = too little information to judge the lead properly"
    )
    summary: str = Field(
        description="One or two plain sentences a busy salesperson can read in 5 seconds, max 40 words"
    )
    intent: Intent
    key_requirements: list[str] = Field(
        min_length=1, max_length=6, description='Max 6 words each, e.g. "3BHK", "Near ITPL", "Ready to move"'
    )
    objections: list[Objection] = Field(max_length=4)
    contradictions: list[str] = Field(
        max_length=3,
        description='Things that do not add up, phrased as a check, e.g. "Verify budget: ..." (max 25 words)',
    )
    missing_info: list[str] = Field(
        max_length=3, description="Questions the salesperson should ask to fill a gap, max 15 words each"
    )
    signals: Signals
    next_action: NextAction
    call_brief: CallBrief
    suggested_response: str = Field(
        description="Message the salesperson can send now, written as the salesperson, in the customer's language "
        "and script, max 90 words"
    )
    language: Literal["english", "hinglish", "hindi", "other"] = Field(
        description="The language the customer wrote in"
    )


# ---- API responses ------------------------------------------------------------------------------------------


class Reason(CamelModel):
    """One line of 'Why this score?': a signal, its level, the points it earned and the quote behind it."""

    signal: str
    level: str
    points: int
    max: int
    evidence: str


class SignalChange(CamelModel):
    signal: str
    from_: str = Field(alias="from")
    to: str
    evidence: str


class ListLead(CamelModel):
    """A lead as shown in the left-hand list."""

    id: str
    name: str
    location: str
    budget: str
    timeline: str
    summary: str | None
    tier: str | None
    score: int | None
    status: str
    stage: str
    created_at: datetime
    first_contact_at: datetime | None
    next_follow_up_at: datetime | None


class QueueEntry(CamelModel):
    """A lead's place in the call queue and why it is there."""

    id: str
    bucket: Literal["overdue", "follow_up_due", "new", "scheduled"]
    sla_minutes: int | None


class LeadList(CamelModel):
    leads: list[ListLead]
    queue: list[QueueEntry]
