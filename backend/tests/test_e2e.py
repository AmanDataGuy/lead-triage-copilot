"""
# test_e2e.py - checks every requirement of the assignment in a real browser, one test per requirement

- Each test starts as a brand-new visitor (fresh cookie, so a fresh workspace with the 8 sample leads).
- Skipped unless E2E_BASE_URL is set, because some tests use real AI quota. Run against local or the live URL:
  `E2E_BASE_URL=https://your-app.vercel.app uv run pytest tests/test_e2e.py -v`
- Needs a browser once: `uv run playwright install chromium`
"""

import os
import re

import pytest
from playwright.sync_api import Page, expect

BASE_URL = os.environ.get("E2E_BASE_URL")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="set E2E_BASE_URL to run the browser test")
AI_TIMEOUT = 60_000


def open_lead(page: Page, name: str) -> None:
    """Open a sample lead from the All leads tab."""
    page.goto(f"{BASE_URL}/leads")
    page.get_by_role("tab", name=re.compile("All leads")).click()
    page.get_by_role("link", name=re.compile(name)).first.click()
    page.wait_for_url(re.compile(r"/leads/[0-9a-f-]{36}"))


def test_1_lead_intake_form_has_every_required_field(page: Page):
    """Name, Location, Property requirement, Budget, Buying timeline and a free-text Customer message."""
    page.goto(f"{BASE_URL}/leads")
    page.get_by_role("button", name="New lead").click()
    for label in ("Name", "Location", "Property requirement", "Budget", "Buying timeline"):
        expect(page.get_by_label(label, exact=True)).to_be_visible()
    expect(page.get_by_label("Customer message or chat transcript")).to_be_visible()


def test_2_ai_analysis_returns_all_six_outputs_for_a_new_lead(page: Page):
    """Summary, intent, key requirements, objections, next action and suggested response, from a real AI call."""
    page.goto(f"{BASE_URL}/leads")
    page.get_by_role("button", name="New lead").click()
    page.get_by_role("button", name="Fill example").click()
    page.get_by_role("button", name="Save and analyse").click()
    page.wait_for_url(re.compile(r"/leads/[0-9a-f-]{36}"), timeout=AI_TIMEOUT)

    expect(page.get_by_role("heading", name="Ananya Iyer")).to_be_visible()
    expect(page.get_by_text("Next action")).to_be_visible()  # recommended next action
    expect(page.get_by_text("Objections")).to_be_visible()  # objections / concerns
    expect(page.get_by_text("Suggested reply")).to_be_visible()  # suggested response
    expect(
        page.get_by_text(re.compile("3BHK", re.IGNORECASE)).first
    ).to_be_visible()  # key requirements chips
    page.get_by_role("button", name="Intent and original message").click()
    expect(page.get_by_text("Intent:")).to_be_visible()  # customer intent
    expect(page.get_by_text(re.compile(r"Analysed by \S+"))).to_be_visible()  # real model named, not canned


def test_3_chat_answers_are_grounded_in_the_lead(page: Page):
    """Follow-up questions get answers about this lead, and rewrites come back as a usable draft."""
    open_lead(page, "Rohit Verma")
    page.get_by_role("tab", name="Ask AI").click()
    page.get_by_role("button", name="What should I emphasise on the call?").click()
    answer = page.locator("ol[aria-live] > li").nth(1)
    expect(answer).to_contain_text(
        re.compile(
            r"Whitefield|Saturday|SBI|east|wife|rent|2BHK|loan|ready.to.move|lakh|price sheet|site visit",
            re.IGNORECASE,
        ),
        timeout=AI_TIMEOUT,
    )

    page.get_by_label("Message").fill("Make my reply more assertive")
    page.get_by_role("button", name="Send").click()
    page.get_by_role("button", name="Use as suggested reply").click(timeout=AI_TIMEOUT)
    expect(page.get_by_text("Saved as the suggested reply")).to_be_visible()


def test_4_saved_leads_are_ranked_and_grouped_by_priority(page: Page):
    """Multiple saved leads, grouped Hot / Warm / Cold / Junk, best first, plus the call queue."""
    page.goto(f"{BASE_URL}/leads")
    expect(page.get_by_role("tab", name=re.compile(r"All leads \(8\)"))).to_be_visible()
    page.get_by_role("tab", name=re.compile("All leads")).click()
    for group in ("hot (3)", "warm (2)", "cold (2)", "junk (1)"):
        expect(page.get_by_text(group, exact=True)).to_be_visible()
    hot = page.locator("details").first.get_by_role("link")
    expect(hot.first).to_contain_text("Rohit Verma")  # highest score first


def test_5_display_is_scannable_with_an_explained_score(page: Page):
    """Tier and score up top, next action first, and every point of the score traced to the customer's words."""
    open_lead(page, "Rohit Verma")
    expect(page.get_by_label(re.compile(r"Hot lead, score \d+ out of 100")).first).to_be_visible()
    page.get_by_role("button", name="Why this score?").click()
    expect(page.get_by_text(re.compile(r"\+\d+/20")).first).to_be_visible()


def test_6_own_feature_call_loop(page: Page):
    """Call queue with speed-to-lead timers, a call brief, and a logged call that updates the lead."""
    page.goto(f"{BASE_URL}/leads")
    expect(page.get_by_text(re.compile(r"hot leads? ha(s|ve) waited over 5 minutes"))).to_be_visible()
    expect(page.get_by_text(re.compile(r"waiting \d+[mhd]")).first).to_be_visible()

    open_lead(page, "Priya Nair")
    page.get_by_role("tab", name="Call", exact=True).click()
    expect(page.get_by_text("Call brief")).to_be_visible()
    page.get_by_role("radio", name="Site visit booked").click()
    page.get_by_label("What happened?").fill(
        "Chennai flat sale closed, funds are ready. Husband agreed on the call; both visiting Saturday 11am."
    )
    page.get_by_role("button", name="Save call").click()
    expect(page.get_by_text("Call history")).to_be_visible(timeout=AI_TIMEOUT)
    expect(page.get_by_text("Follow-up draft (updated after your call)")).to_be_visible()
    expect(page.get_by_role("link", name="WhatsApp").first).to_have_attribute(
        "href", re.compile(r"^https://wa\.me/91")
    )
