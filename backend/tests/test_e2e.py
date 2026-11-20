"""
# test_e2e.py - clicks through the real app in a browser: list, new lead, log a call, chat

- Skipped unless E2E_BASE_URL is set, because it uses real AI quota. Run against local or the live URL:
  `E2E_BASE_URL=https://your-app.vercel.app uv run pytest tests/test_e2e.py`
- Needs a browser once: `uv run playwright install chromium`
"""

import os
import re

import pytest
from playwright.sync_api import Page, expect

BASE_URL = os.environ.get("E2E_BASE_URL")
pytestmark = pytest.mark.skipif(not BASE_URL, reason="set E2E_BASE_URL to run the browser test")


def test_main_workflow(page: Page):
    """A first-time visitor sees ranked sample leads, adds a lead, logs a call and chats about it."""
    page.goto(f"{BASE_URL}/leads")
    expect(page.get_by_role("tab", name=re.compile("Call queue"))).to_be_visible()
    expect(page.get_by_text("Rohit Verma").first).to_be_visible()

    # New lead, analysed by the real AI.
    page.get_by_role("button", name="New lead").click()
    page.get_by_role("button", name="Fill example").click()
    page.get_by_role("button", name="Save and analyse").click()
    page.wait_for_url(re.compile(r"/leads/[0-9a-f-]{36}"), timeout=60_000)
    expect(page.get_by_text("Next action")).to_be_visible()
    expect(page.get_by_role("heading", name="Ananya Iyer")).to_be_visible()

    # Call Loop: log a call; the history records it.
    page.get_by_role("tab", name="Call", exact=True).click()
    page.get_by_role("radio", name="Site visit booked").click()
    page.get_by_label("What happened?").fill(
        "Husband agreed, both coming Saturday 11am. Maintenance is fine."
    )
    page.get_by_role("button", name="Save call").click()
    expect(page.get_by_text("Call history")).to_be_visible(timeout=60_000)

    # Chat: a rewrite comes back as a draft that can be saved as the suggested reply.
    page.get_by_role("tab", name="Ask AI").click()
    page.get_by_role("button", name="Make my reply more assertive").click()
    page.get_by_role("button", name="Use as suggested reply").click(timeout=60_000)
    expect(page.get_by_text("Saved as the suggested reply")).to_be_visible()
