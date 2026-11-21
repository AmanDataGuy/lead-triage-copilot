"""
# workspace.py - gives every browser its own private set of leads, with no login

- The UI sets a random id in the "wid" cookie on the first visit; workspace_id() reads and checks it.
- The first time a workspace is seen it is created and filled with sample leads (seed.json). Their analyses were
  produced earlier by this same AI pipeline (scripts/build_seed.py), so browsing the demo costs no AI quota.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

from fastapi import Cookie, HTTPException
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, delete

from app.core.db import Lead, Workspace
from app.domain.scoring import score_lead
from app.schemas import LeadAnalysis

SEED = json.loads((Path(__file__).parent / "seed.json").read_text())


def workspace_id(wid: Annotated[str | None, Cookie()] = None) -> uuid.UUID:
    """This browser's workspace id, from its cookie (FastAPI dependency)."""
    try:
        return uuid.UUID(wid or "")
    except ValueError:
        raise HTTPException(401, "Missing workspace cookie") from None


def seed_leads(session: Session, ws: uuid.UUID) -> None:
    """Add the sample leads, ages offset from now so the speed-to-lead timers look live."""
    now = datetime.now(UTC)
    for item in SEED:
        analysis = LeadAnalysis.model_validate(item["analysis"])
        score, tier, reasons = score_lead(analysis)
        created = now - timedelta(minutes=item["minutesAgo"])
        session.add(
            Lead(
                **item["lead"],
                workspace_id=ws,
                status="ready",
                analysis=analysis.model_dump(by_alias=True),
                score=score,
                tier=tier,
                reasons=[r.model_dump() for r in reasons],
                model=item["model"],
                analyzed_at=created,
                created_at=created,
            )
        )


def ensure_workspace(session: Session, ws: uuid.UUID) -> None:
    """Create the workspace on first sight and give it the sample leads; does nothing for a known workspace."""
    created = session.exec(
        insert(Workspace).values(id=ws).on_conflict_do_nothing().returning(Workspace.id)
    ).first()
    if created:
        seed_leads(session, ws)
    session.commit()


def reset_workspace(session: Session, ws: uuid.UUID) -> None:
    """Delete this workspace's leads and put the sample leads back ("Reset demo")."""
    session.exec(delete(Lead).where(Lead.workspace_id == ws))
    seed_leads(session, ws)
    session.commit()
