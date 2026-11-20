"""
# main.py - the FastAPI app: every route the UI calls

- Leads: list (with the call queue order), detail, create + analyse, retry, delete, reset demo.
- Call Loop: log a call (re-analyses real conversations), save an approved reply.
- Chat: streams the AI's answer as plain text and saves both messages when it finishes.
- Every route works only inside the visitor's own workspace (cookie), and the score always comes from scoring.py.
"""

import os
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic.alias_generators import to_camel
from sqlmodel import Session, col, delete, select

from app.ai import AI_ERRORS, analyze_lead, stream_chat
from app.call_queue import NO_ANSWER_RETRY, QueueLead, diff_signals, follow_up_at, order_queue, sla_minutes
from app.db import Activity, Lead, Message, Usage, Workspace, engine, get_session
from app.limits import QuotaError, consume_ai_call
from app.schemas import ChatInput, LeadAnalysis, LeadInput, LogCallInput, ReplyInput
from app.scoring import score_lead, sort_key
from app.workspace import ensure_workspace, reset_workspace, workspace_id

app = FastAPI(title="LeadPilot API")

DB = Annotated[Session, Depends(get_session)]
WS = Annotated[uuid.UUID, Depends(workspace_id)]
HISTORY_TURNS = 12
OUTCOME_LABEL = {
    "no_answer": "No answer",
    "connected": "Connected",
    "visit_booked": "Site visit booked",
    "not_interested": "Not interested",
}


def camel(row) -> dict:
    """A database row as camelCase JSON for the UI."""
    return {to_camel(k): v for k, v in row.model_dump().items()}


def owned_lead(session: Session, ws: uuid.UUID, lead_id: uuid.UUID) -> Lead:
    """Load a lead only if it belongs to this visitor's workspace."""
    lead = session.exec(select(Lead).where(Lead.id == lead_id, Lead.workspace_id == ws)).first()
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead


def looks_like_junk(lead: LeadInput) -> bool:
    """True when the input has almost no real words, so it isn't worth an AI call."""
    return len(re.findall(r"[^\W\d_]{2,}", f"{lead.requirement} {lead.location} {lead.message}")) < 3


async def analyze_and_save(session: Session, request: Request, lead: Lead) -> str | None:
    """Run the AI on a stored lead and save the analysis with its computed score; returns an error message or None."""
    try:
        consume_ai_call(session, request, lead.workspace_id)
        analysis, model = await analyze_lead(lead)
    except QuotaError as e:
        error = str(e)
    except AI_ERRORS:  # every model failed: keep the lead, let the salesperson retry
        error = "The AI is unavailable right now. Please retry."
    else:
        score, tier, reasons = score_lead(analysis)
        lead.sqlmodel_update(
            {
                "status": "ready",
                "analysis": analysis.model_dump(by_alias=True),
                "score": score,
                "tier": tier,
                "reasons": [r.model_dump() for r in reasons],
                "model": model,
                "analyzed_at": datetime.now(UTC),
            }
        )
        session.add(lead)
        session.commit()
        return None
    # Keep a previous analysis if there was one; only a never-analysed lead is marked failed.
    if lead.status != "ready":
        lead.status = "failed"
        session.add(lead)
        session.commit()
    return error


@app.get("/api/leads")
def list_leads(session: DB, ws: WS):
    """All of this visitor's leads, best first, plus today's call queue order."""
    ensure_workspace(session, ws)
    rows = session.exec(select(Lead).where(Lead.workspace_id == ws)).all()
    parsed = {l.id: LeadAnalysis.model_validate(l.analysis) if l.analysis else None for l in rows}
    rows = sorted(rows, key=lambda l: sort_key(l.score, parsed[l.id], l.created_at))
    queue_leads = [
        QueueLead(
            str(l.id),
            l.tier,
            l.score,
            l.status,
            l.stage,
            l.created_at,
            l.first_contact_at,
            l.next_follow_up_at,
        )
        for l in rows
    ]
    queue = order_queue(queue_leads, datetime.now(UTC))
    return {
        "leads": [
            {
                "id": str(l.id),
                "name": l.name,
                "location": l.location,
                "budget": l.budget,
                "timeline": l.timeline,
                "summary": parsed[l.id].summary if parsed[l.id] else None,
                "tier": l.tier,
                "score": l.score,
                "status": l.status,
                "stage": l.stage,
                "createdAt": l.created_at,
                "firstContactAt": l.first_contact_at,
                "nextFollowUpAt": l.next_follow_up_at,
            }
            for l in rows
        ],
        "queue": [{"id": q.id, "bucket": b, "slaMinutes": sla_minutes(q)} for q, b in queue],
    }


@app.get("/api/leads/{lead_id}")
def get_lead(lead_id: uuid.UUID, session: DB, ws: WS):
    """One lead with its call history and chat."""
    lead = owned_lead(session, ws, lead_id)
    activities = session.exec(
        select(Activity).where(Activity.lead_id == lead_id).order_by(col(Activity.created_at).desc())
    ).all()
    messages = session.exec(
        select(Message).where(Message.lead_id == lead_id).order_by(col(Message.created_at))
    ).all()
    return {
        "lead": camel(lead),
        "activities": [camel(a) for a in activities],
        "messages": [{"id": m.id, "role": m.role, "parts": m.parts} for m in messages],
    }


@app.post("/api/leads")
async def create_lead(body: LeadInput, request: Request, session: DB, ws: WS):
    """Save a new lead and analyse it. The lead is kept even if the AI step fails."""
    if looks_like_junk(body):
        raise HTTPException(422, "Add a few real details about what the customer wants.")
    ensure_workspace(session, ws)
    lead = Lead(**body.model_dump(), workspace_id=ws)
    session.add(lead)
    session.commit()
    error = await analyze_and_save(session, request, lead)
    return {"id": str(lead.id), "error": error}


@app.post("/api/leads/{lead_id}/retry")
async def retry_analysis(lead_id: uuid.UUID, request: Request, session: DB, ws: WS):
    """Run the analysis again for a lead whose first attempt failed."""
    return {"error": await analyze_and_save(session, request, owned_lead(session, ws, lead_id))}


@app.post("/api/leads/{lead_id}/calls")
async def log_call(lead_id: uuid.UUID, body: LogCallInput, request: Request, session: DB, ws: WS):
    """Record a call. Real conversations go back through the AI so the score, next step and follow-up draft update."""
    lead = owned_lead(session, ws, lead_id)
    now = datetime.now(UTC)
    before_score = lead.score
    before = LeadAnalysis.model_validate(lead.analysis) if lead.analysis else None
    lead.first_contact_at = lead.first_contact_at or now

    # No answer or not interested: nothing new to learn, so no AI call.
    if body.outcome in ("no_answer", "not_interested"):
        lead.stage = "closed_lost" if body.outcome == "not_interested" else lead.stage
        lead.next_follow_up_at = now + NO_ANSWER_RETRY if body.outcome == "no_answer" else None
        session.add(lead)
        session.add(
            Activity(
                lead_id=lead.id,
                outcome=body.outcome,
                note=body.note,
                score_before=before_score,
                score_after=before_score,
            )
        )
        session.commit()
        return {"error": None, "scoreBefore": before_score, "scoreAfter": before_score}

    stamp = (now + timedelta(hours=5, minutes=30)).strftime("%d %b %H:%M")  # India time
    lead.call_notes = (
        f"{lead.call_notes}\n[{stamp}, {OUTCOME_LABEL[body.outcome]}] {body.note or '(no notes)'}".strip()
    )
    lead.stage = "visit_booked" if body.outcome == "visit_booked" else "contacted"
    session.add(lead)
    session.commit()

    error = await analyze_and_save(session, request, lead)
    after = LeadAnalysis.model_validate(lead.analysis) if lead.analysis and not error else None
    if after:
        lead.next_follow_up_at = follow_up_at(after.next_action.when, now)
        session.add(lead)
    changes = [c.model_dump(by_alias=True) for c in diff_signals(before, after)] if after else []
    session.add(
        Activity(
            lead_id=lead.id,
            outcome=body.outcome,
            note=body.note,
            score_before=before_score,
            score_after=lead.score,
            changes=changes,
        )
    )
    session.commit()
    return {"error": error, "scoreBefore": before_score, "scoreAfter": lead.score}


@app.put("/api/leads/{lead_id}/reply")
def apply_reply(lead_id: uuid.UUID, body: ReplyInput, session: DB, ws: WS):
    """Save a reply the salesperson approved from the chat as this lead's suggested response."""
    lead = owned_lead(session, ws, lead_id)
    if not lead.analysis:
        raise HTTPException(409, "This lead has no analysis yet.")
    lead.analysis = {**lead.analysis, "suggestedResponse": body.text}
    session.add(lead)
    session.commit()
    return {"ok": True}


@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: uuid.UUID, session: DB, ws: WS):
    """Delete one lead; its chat and call history go with it."""
    session.delete(owned_lead(session, ws, lead_id))
    session.commit()
    return {"ok": True}


@app.post("/api/reset")
def reset_demo(session: DB, ws: WS):
    """Put the sample leads back, removing everything this visitor added."""
    ensure_workspace(session, ws)
    reset_workspace(session, ws)
    return {"ok": True}


@app.post("/api/leads/{lead_id}/chat")
async def chat(lead_id: uuid.UUID, body: ChatInput, request: Request, session: DB, ws: WS):
    """Stream the AI's answer about one lead. Everything the AI sees is loaded here, so it can't be tampered with."""
    lead = owned_lead(session, ws, lead_id)
    try:
        consume_ai_call(session, request, ws)
    except QuotaError as e:
        raise HTTPException(429, str(e)) from None
    recent = session.exec(
        select(Message)
        .where(Message.lead_id == lead_id)
        .order_by(col(Message.created_at).desc())
        .limit(HISTORY_TURNS)
    ).all()
    history = [(m.role, "".join(p.get("text", "") for p in m.parts)) for m in reversed(recent)]

    async def answer():
        text = ""
        try:
            async for chunk in stream_chat(lead, history, body.text):
                text += chunk
                yield chunk
        except AI_ERRORS:
            yield "\n\nCouldn't reach the AI. Please try again."
            return
        # Save both messages once the answer is complete (a fresh session: the request's may already be closed).
        with Session(engine) as s:
            s.add(
                Message(id=body.id, lead_id=lead_id, role="user", parts=[{"type": "text", "text": body.text}])
            )
            s.add(
                Message(
                    id=str(uuid.uuid4()),
                    lead_id=lead_id,
                    role="assistant",
                    parts=[{"type": "text", "text": text}],
                )
            )
            s.commit()

    return StreamingResponse(answer(), media_type="text/plain; charset=utf-8")


@app.get("/api/cron/cleanup")
def cleanup(session: DB, authorization: Annotated[str | None, Header()] = None):
    """Daily job (Vercel Cron): delete workspaces older than 7 days and old usage counters."""
    if not os.environ.get("CRON_SECRET") or authorization != f"Bearer {os.environ['CRON_SECRET']}":
        raise HTTPException(401, "Unauthorized")
    now = datetime.now(UTC)
    result = session.exec(delete(Workspace).where(col(Workspace.created_at) < now - timedelta(days=7)))
    session.exec(delete(Usage).where(col(Usage.day) < (now - timedelta(days=3)).date()))
    session.commit()
    return {"deletedWorkspaces": result.rowcount}
