"""
# limits.py - daily caps on AI calls, so one visitor (or a bot) can't burn the free quota for everyone

- Three counters per day: this IP (hashed, never stored raw), this workspace, and the whole site.
- One SQL statement bumps all three and returns the new counts.
- The site-wide cap sits below Gemini's free daily quota, so the demo degrades politely instead of failing.
"""

import hashlib
import uuid
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from app.core.db import Usage

DAILY_LIMITS = {"ip": 40, "workspace": 40, "global": 350}


class QuotaError(Exception):
    """Raised when a daily AI cap is used up."""


def consume_ai_call(session: Session, request: Request, ws: uuid.UUID) -> None:
    """Count one AI call against today's caps; raises QuotaError if any cap is now exceeded."""
    ip = (request.headers.get("x-forwarded-for") or "unknown").split(",")[0].strip()
    keys = {
        f"ip:{hashlib.sha256(ip.encode()).hexdigest()[:32]}": DAILY_LIMITS["ip"],
        f"ws:{ws}": DAILY_LIMITS["workspace"],
        "global": DAILY_LIMITS["global"],
    }
    day = datetime.now(UTC).date()
    stmt = insert(Usage).values([{"day": day, "key": k, "count": 1} for k in keys])
    stmt = stmt.on_conflict_do_update(index_elements=["day", "key"], set_={"count": Usage.count + 1})
    counts = dict(session.exec(stmt.returning(Usage.key, Usage.count)).all())
    session.commit()
    if any(counts.get(key, 0) > limit for key, limit in keys.items()):
        raise QuotaError("Today's free AI quota for this demo is used up. Please try again tomorrow.")
