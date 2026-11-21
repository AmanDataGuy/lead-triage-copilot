"""
# db.py - the database tables (Postgres on Neon, via SQLModel) and the session used by each request

- workspaces: one per browser (anonymous cookie), so each visitor has a private set of leads.
- leads: the intake form, the stored AI analysis with its computed score/tier, and Call Loop state.
- messages: the follow-up chat history. activities: one row per logged call. usage: daily AI call counters.
- A small connection pool, reused across requests by warm serverless instances (Neon's pooler sits behind it).
- Run `uv run python -m app.core.db` once to create the tables.
"""

import os
import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import Column, DateTime, ForeignKey, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Session, SQLModel, create_engine


def _now() -> datetime:
    return datetime.now(UTC)


def _ts(nullable: bool = True) -> Any:
    return Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=nullable))


def _created() -> Any:
    return Field(default_factory=_now, sa_column=Column(DateTime(timezone=True), nullable=False))


def _parent(table: str) -> Any:
    return Field(
        sa_column=Column(Uuid, ForeignKey(f"{table}.id", ondelete="CASCADE"), nullable=False, index=True)
    )


class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"
    id: uuid.UUID = Field(primary_key=True)
    created_at: datetime = _created()


class Lead(SQLModel, table=True):
    __tablename__ = "leads"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = _parent("workspaces")
    name: str
    phone: str = ""
    location: str
    requirement: str
    budget: str
    timeline: str
    message: str = ""
    call_notes: str = ""
    status: str = "analyzing"  # analyzing | ready | failed
    analysis: dict | None = Field(default=None, sa_column=Column(JSONB))
    score: int | None = None
    tier: str | None = None
    reasons: list | None = Field(default=None, sa_column=Column(JSONB))
    model: str | None = None
    analyzed_at: datetime | None = _ts()
    stage: str = "new"  # new | contacted | visit_booked | closed_lost
    first_contact_at: datetime | None = _ts()
    next_follow_up_at: datetime | None = _ts()
    created_at: datetime = _created()


class Message(SQLModel, table=True):
    __tablename__ = "messages"
    id: str = Field(primary_key=True)
    lead_id: uuid.UUID = _parent("leads")
    role: str  # user | assistant
    parts: list = Field(sa_column=Column(JSONB, nullable=False))
    created_at: datetime = _created()


class Activity(SQLModel, table=True):
    __tablename__ = "activities"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    lead_id: uuid.UUID = _parent("leads")
    outcome: str
    note: str = ""
    score_before: int | None = None
    score_after: int | None = None
    changes: list = Field(default_factory=list, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = _created()


class Usage(SQLModel, table=True):
    __tablename__ = "usage"
    day: date = Field(primary_key=True)
    key: str = Field(primary_key=True)
    count: int = 0


def _url() -> str:
    # SQLAlchemy needs the driver named in the URL; Neon gives a plain postgresql:// one.
    return os.environ.get("DATABASE_URL", "").replace("postgresql://", "postgresql+psycopg://", 1)


# A small pool: warm serverless instances are reused, and opening a new TLS connection per query costs ~1 s.
# pre_ping drops connections Neon closed while the database slept.
engine = (
    create_engine(_url(), pool_size=2, max_overflow=3, pool_pre_ping=True, pool_recycle=300)
    if os.environ.get("DATABASE_URL")
    else None
)


def get_session():
    """One database session per request (FastAPI dependency)."""
    with Session(engine) as session:
        yield session


if __name__ == "__main__":
    SQLModel.metadata.create_all(engine)
    print("Tables are ready.")
