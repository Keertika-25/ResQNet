"""Database engine, session and ORM models (SQLite by default)."""
import os
from datetime import datetime, timezone

from sqlalchemy import (Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text,
                        create_engine, event)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resqnet.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})


@event.listens_for(engine, "connect")
def _sqlite_fk_on(dbapi_conn, _):
    if DATABASE_URL.startswith("sqlite"):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # stored as naive UTC


ROLES = ("citizen", "dispatcher", "rescue", "hospital")
INCIDENT_TYPES = ("Road Accident", "Medical Emergency", "Fire", "Building Collapse", "Flooding", "Other")
SEVERITIES = ("Minor", "Moderate", "Serious", "Life-threatening")
PRIORITIES = ("Low", "Medium", "High", "Critical")
INCIDENT_STATUSES = ("Reported", "Assigned", "En Route", "On Scene", "Resolved", "Closed")
ASSIGNMENT_STATUSES = ("Assigned", "Accepted", "Rejected", "En Route", "On Scene", "Completed", "Cancelled")
TEAM_STATUSES = ("available", "busy", "off_duty")
ED_STATUSES = ("Open", "Limited", "Diverting", "Closed")


def _in(col: str, values) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class Hospital(Base):
    __tablename__ = "hospitals"
    __table_args__ = (
        CheckConstraint("available_beds >= 0 AND available_beds <= total_beds", name="ck_beds"),
        CheckConstraint("icu_available >= 0 AND icu_available <= icu_total", name="ck_icu"),
        CheckConstraint(_in("ed_status", ED_STATUSES), name="ck_ed_status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    address: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(40))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    total_beds: Mapped[int] = mapped_column(Integer)
    available_beds: Mapped[int] = mapped_column(Integer)
    icu_total: Mapped[int] = mapped_column(Integer)
    icu_available: Mapped[int] = mapped_column(Integer)
    ed_status: Mapped[str] = mapped_column(String(20), default="Open")
    ed_wait_minutes: Mapped[int] = mapped_column(Integer, default=0)
    specialties: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    resources_updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class RescueTeam(Base):
    __tablename__ = "rescue_teams"
    __table_args__ = (CheckConstraint(_in("status", TEAM_STATUSES), name="ck_team_status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    team_type: Mapped[str] = mapped_column(String(60))  # e.g. Fire & Rescue, Ambulance
    members: Mapped[int] = mapped_column(Integer, default=4)
    phone: Mapped[str] = mapped_column(String(40))
    base_lat: Mapped[float] = mapped_column(Float)
    base_lng: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="available")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in("role", ROLES), name="ck_role"),
        # a rescue user must belong to a team, a hospital admin to a hospital
        CheckConstraint("role != 'rescue' OR team_id IS NOT NULL", name="ck_rescue_team"),
        CheckConstraint("role != 'hospital' OR hospital_id IS NOT NULL", name="ck_hospital_admin"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("rescue_teams.id", ondelete="SET NULL"))
    hospital_id: Mapped[int | None] = mapped_column(ForeignKey("hospitals.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    team: Mapped[RescueTeam | None] = relationship()
    hospital: Mapped[Hospital | None] = relationship()


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(_in("incident_type", INCIDENT_TYPES), name="ck_type"),
        CheckConstraint(_in("reported_severity", SEVERITIES), name="ck_severity"),
        CheckConstraint(_in("priority", PRIORITIES), name="ck_priority"),
        CheckConstraint(_in("auto_priority", PRIORITIES), name="ck_auto_priority"),
        CheckConstraint(_in("status", INCIDENT_STATUSES), name="ck_incident_status"),
        CheckConstraint("lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name="ck_coords"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    incident_type: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text)
    reported_severity: Mapped[str] = mapped_column(String(20))
    people_affected: Mapped[int] = mapped_column(Integer, default=1)
    location_text: Mapped[str] = mapped_column(String(255))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    contact_phone: Mapped[str] = mapped_column(String(40), default="")
    auto_priority: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(20))
    priority_score: Mapped[int] = mapped_column(Integer, default=0)
    priority_reason: Mapped[str] = mapped_column(Text, default="")
    priority_overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="Reported", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    reporter: Mapped[User] = relationship()
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="incident", order_by="Assignment.id",
                                                           cascade="all, delete-orphan")
    updates: Mapped[list["IncidentUpdate"]] = relationship(back_populates="incident", order_by="IncidentUpdate.id",
                                                           cascade="all, delete-orphan")


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (CheckConstraint(_in("status", ASSIGNMENT_STATUSES), name="ck_assignment_status"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("rescue_teams.id", ondelete="RESTRICT"), index=True)
    assigned_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="Assigned")
    response_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    incident: Mapped[Incident] = relationship(back_populates="assignments")
    team: Mapped[RescueTeam] = relationship()
    assigned_by: Mapped[User] = relationship()


class IncidentUpdate(Base):
    __tablename__ = "incident_updates"
    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20))  # created | priority | assignment | status | closed | note
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    incident: Mapped[Incident] = relationship(back_populates="updates")
    author: Mapped[User | None] = relationship()


def init_db():
    Base.metadata.create_all(engine)
