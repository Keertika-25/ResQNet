"""ResQNet API - academic prototype. Never contacts real emergency services."""
import os
from collections import Counter
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import schemas as S
from .classify import RULES_TEXT, classify
from .db import (Assignment, Hospital, Incident, IncidentUpdate, RescueTeam, SessionLocal, User, get_db, init_db,
                 now)
from .security import create_token, current_user, hash_password, require, verify_password

ACTIVE_ASSIGNMENT = ("Assigned", "Accepted", "En Route", "On Scene")
OPEN_INCIDENT = ("Reported", "Assigned", "En Route", "On Scene")
NEXT_STATUS = {"Accepted": "En Route", "En Route": "On Scene", "On Scene": "Completed"}
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if os.getenv("SEED_ON_STARTUP", "true").lower() == "true":
        from .seed import seed_if_empty
        with SessionLocal() as db:
            seed_if_empty(db)
    yield


app = FastAPI(title="ResQNet API", version="1.0.0", lifespan=lifespan,
              description="Intelligent Emergency Response and Rescue Coordination System - academic prototype. "
                          "Does not connect to real emergency services.")
app.add_middleware(CORSMiddleware,
                   allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_methods=["*"], allow_headers=["*"])


# ---------------- helpers ----------------
def _active_assignment(inc: Incident) -> Assignment | None:
    return next((a for a in inc.assignments if a.status in ACTIVE_ASSIGNMENT), None)


def _incident_out(inc: Incident) -> dict:
    data = S.IncidentOut.model_validate(
        {**{c: getattr(inc, c) for c in S.IncidentOut.model_fields if hasattr(inc, c)},
         "reporter_name": inc.reporter.name}).model_dump()
    active = _active_assignment(inc)
    data["current_team"] = active.team.name if active else None
    return data


def _assignment_out(a: Assignment) -> dict:
    return S.AssignmentOut.model_validate({**{c: getattr(a, c) for c in S.AssignmentOut.model_fields if hasattr(a, c)},
                                           "team_name": a.team.name}).model_dump()


def _detail_out(inc: Incident) -> dict:
    return {**_incident_out(inc),
            "assignments": [_assignment_out(a) for a in inc.assignments],
            "updates": [{"id": u.id, "kind": u.kind, "message": u.message, "created_at": u.created_at,
                         "author_name": u.author.name if u.author else None} for u in inc.updates]}


def _log(db: Session, inc: Incident, user: User | None, kind: str, message: str):
    db.add(IncidentUpdate(incident=inc, author_id=user.id if user else None, kind=kind, message=message))


def _get_incident_for(db: Session, incident_id: int, user: User) -> Incident:
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    allowed = (user.role == "dispatcher"
               or (user.role == "citizen" and inc.reporter_id == user.id)
               or (user.role == "rescue" and any(a.team_id == user.team_id for a in inc.assignments)))
    if not allowed:
        raise HTTPException(404, "Incident not found")  # don't reveal existence
    return inc


def _own_assignment(db: Session, assignment_id: int, user: User) -> Assignment:
    a = db.get(Assignment, assignment_id)
    if not a or a.team_id != user.team_id:
        raise HTTPException(404, "Assignment not found")
    return a


# ---------------- auth ----------------
@app.post("/api/auth/register", response_model=S.TokenOut, status_code=201, tags=["auth"])
def register(body: S.RegisterIn, db: Session = Depends(get_db)):
    """Self-registration is for citizens only; other roles are provisioned by the seed/admin."""
    user = User(name=body.name.strip(), email=body.email.lower(), phone=body.phone,
                password_hash=hash_password(body.password), role="citizen")
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists")
    return {"access_token": create_token(user), "user": user}


@app.post("/api/auth/login", response_model=S.TokenOut, tags=["auth"])
def login(body: S.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {"access_token": create_token(user), "user": user}


@app.get("/api/auth/me", response_model=S.UserOut, tags=["auth"])
def me(user: User = Depends(current_user)):
    return user


# ---------------- classification ----------------
@app.get("/api/classification/rules", tags=["incidents"])
def classification_rules():
    return {"disclaimer": "Prototype decision aid only - not a medical triage system. Dispatchers review and may override.",
            "rules": RULES_TEXT}


@app.post("/api/classification/preview", tags=["incidents"])
def classification_preview(body: S.ClassifyIn, _: User = Depends(current_user)):
    priority, score, reason = classify(body.incident_type, body.reported_severity, body.people_affected, body.description)
    return {"priority": priority, "score": score, "reason": reason}


# ---------------- incidents ----------------
@app.post("/api/incidents", response_model=S.IncidentDetailOut, status_code=201, tags=["incidents"])
def create_incident(body: S.IncidentIn, user: User = Depends(require("citizen")), db: Session = Depends(get_db)):
    priority, score, reason = classify(body.incident_type, body.reported_severity, body.people_affected, body.description)
    inc = Incident(**body.model_dump(exclude={"contact_phone"}), reporter_id=user.id, auto_priority=priority, priority=priority,
                   priority_score=score, priority_reason=reason, contact_phone=body.contact_phone or user.phone)
    db.add(inc)
    db.flush()
    inc.code = f"RQN-{inc.created_at:%y%m%d}-{inc.id:04d}"
    _log(db, inc, user, "created", f"Incident reported. Suggested priority: {priority}.")
    db.commit()
    db.refresh(inc)
    return _detail_out(inc)


@app.get("/api/incidents", response_model=list[S.IncidentOut], tags=["incidents"])
def list_incidents(priority: S.Priority | None = None, incident_type: S.IncidentType | None = Query(None, alias="type"),
                   status: str | None = None, active: bool | None = None,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Incident).order_by(Incident.created_at.desc(), Incident.id.desc())
    if user.role == "citizen":
        q = q.where(Incident.reporter_id == user.id)
    elif user.role == "rescue":
        q = q.where(Incident.id.in_(select(Assignment.incident_id).where(Assignment.team_id == user.team_id)))
    elif user.role != "dispatcher":
        raise HTTPException(403, "You do not have access to incidents")
    if priority:
        q = q.where(Incident.priority == priority)
    if incident_type:
        q = q.where(Incident.incident_type == incident_type)
    if status:
        q = q.where(Incident.status == status)
    if active is not None:
        q = q.where(Incident.status.in_(OPEN_INCIDENT) if active else Incident.status.not_in(OPEN_INCIDENT))
    return [_incident_out(i) for i in db.scalars(q)]


@app.get("/api/incidents/{incident_id}", response_model=S.IncidentDetailOut, tags=["incidents"])
def get_incident(incident_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _detail_out(_get_incident_for(db, incident_id, user))


@app.patch("/api/incidents/{incident_id}/priority", response_model=S.IncidentDetailOut, tags=["dispatcher"])
def override_priority(incident_id: int, body: S.PriorityOverrideIn, user: User = Depends(require("dispatcher")),
                      db: Session = Depends(get_db)):
    inc = _get_incident_for(db, incident_id, user)
    if inc.status == "Closed":
        raise HTTPException(409, "Incident is closed")
    old = inc.priority
    inc.priority = body.priority
    inc.priority_overridden = body.priority != inc.auto_priority
    _log(db, inc, user, "priority", f"Priority changed {old} → {body.priority}. Reason: {body.reason}")
    db.commit()
    return _detail_out(inc)


@app.post("/api/incidents/{incident_id}/assign", response_model=S.IncidentDetailOut, tags=["dispatcher"])
def assign_team(incident_id: int, body: S.AssignIn, user: User = Depends(require("dispatcher")),
                db: Session = Depends(get_db)):
    inc = _get_incident_for(db, incident_id, user)
    if inc.status not in OPEN_INCIDENT:
        raise HTTPException(409, f"Cannot assign a team to a {inc.status.lower()} incident")
    # ponytail: one active team per incident; allow multiple when multi-unit response is needed
    if _active_assignment(inc):
        raise HTTPException(409, "Incident already has an active team assignment")
    team = db.get(RescueTeam, body.team_id)
    if not team:
        raise HTTPException(404, "Rescue team not found")
    if team.status != "available":
        raise HTTPException(409, f"{team.name} is not available")
    db.add(Assignment(incident=inc, team=team, assigned_by_id=user.id, status="Assigned"))
    team.status = "busy"
    inc.status = "Assigned"
    _log(db, inc, user, "assignment", f"{team.name} assigned by dispatcher.")
    db.commit()
    db.refresh(inc)
    return _detail_out(inc)


@app.post("/api/incidents/{incident_id}/close", response_model=S.IncidentDetailOut, tags=["dispatcher"])
def close_incident(incident_id: int, body: S.CloseIn, user: User = Depends(require("dispatcher")),
                   db: Session = Depends(get_db)):
    inc = _get_incident_for(db, incident_id, user)
    if inc.status == "Closed":
        raise HTTPException(409, "Incident is already closed")
    if _active_assignment(inc):
        raise HTTPException(409, "A rescue team is still working on this incident")
    if inc.status != "Resolved" and len(body.note.strip()) < 3:
        raise HTTPException(422, "A note is required to close an incident that was not resolved by a team")
    inc.status = "Closed"
    inc.closed_at = now()
    _log(db, inc, user, "closed", "Incident closed by dispatcher." + (f" Note: {body.note.strip()}" if body.note.strip() else ""))
    db.commit()
    return _detail_out(inc)


# ---------------- dispatcher overview ----------------
@app.get("/api/stats", tags=["dispatcher"])
def stats(_: User = Depends(require("dispatcher")), db: Session = Depends(get_db)):
    incidents = db.scalars(select(Incident)).all()
    teams = db.scalars(select(RescueTeam)).all()
    hospitals = db.scalars(select(Hospital)).all()
    active = [i for i in incidents if i.status in OPEN_INCIDENT]
    today = now().date()
    days = [today - timedelta(days=d) for d in range(6, -1, -1)]
    per_day = Counter(i.created_at.date() for i in incidents)
    return {
        "total": len(incidents),
        "active": len(active),
        "critical": sum(i.priority == "Critical" for i in active),
        "unassigned": sum(i.status == "Reported" for i in active),
        "resolved": sum(i.status in ("Resolved", "Closed") for i in incidents),
        "teams_available": sum(t.status == "available" for t in teams),
        "teams_total": len(teams),
        "hospitals": len(hospitals),
        "beds_available": sum(h.available_beds for h in hospitals),
        "icu_available": sum(h.icu_available for h in hospitals),
        "by_priority": {p: sum(i.priority == p for i in active) for p in ("Critical", "High", "Medium", "Low")},
        "by_type": dict(Counter(i.incident_type for i in incidents)),
        "by_status": dict(Counter(i.status for i in incidents)),
        "trend": [{"date": d.isoformat(), "count": per_day.get(d, 0)} for d in days],
    }


@app.get("/api/teams", response_model=list[S.TeamOut], tags=["teams"])
def list_teams(user: User = Depends(require("dispatcher", "rescue")), db: Session = Depends(get_db)):
    q = select(RescueTeam).order_by(RescueTeam.id)
    if user.role == "rescue":
        q = q.where(RescueTeam.id == user.team_id)
    return db.scalars(q).all()


# ---------------- rescue teams ----------------
@app.get("/api/assignments/mine", response_model=list[S.AssignmentWithIncidentOut], tags=["rescue"])
def my_assignments(user: User = Depends(require("rescue")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Assignment).where(Assignment.team_id == user.team_id).order_by(Assignment.id.desc()))
    return [{**_assignment_out(a), "incident": _incident_out(a.incident)} for a in rows]


@app.post("/api/assignments/{assignment_id}/respond", response_model=S.AssignmentWithIncidentOut, tags=["rescue"])
def respond(assignment_id: int, body: S.RespondIn, user: User = Depends(require("rescue")), db: Session = Depends(get_db)):
    a = _own_assignment(db, assignment_id, user)
    if a.status != "Assigned":
        raise HTTPException(409, f"Assignment already {a.status.lower()}")
    reason = body.reason.strip()
    if body.accept:
        a.status = "Accepted"
        a.response_reason = reason
        _log(db, a.incident, user, "assignment", f"{a.team.name} accepted the assignment.")
    else:
        if len(reason) < 3:
            raise HTTPException(422, "A reason is required to reject an assignment")
        a.status = "Rejected"
        a.response_reason = reason
        a.team.status = "available"
        a.incident.status = "Reported"  # back to the dispatcher queue for reassignment
        _log(db, a.incident, user, "assignment", f"{a.team.name} rejected the assignment. Reason: {reason}")
    db.commit()
    return {**_assignment_out(a), "incident": _incident_out(a.incident)}


@app.post("/api/assignments/{assignment_id}/status", response_model=S.AssignmentWithIncidentOut, tags=["rescue"])
def update_assignment_status(assignment_id: int, body: S.AssignmentStatusIn, user: User = Depends(require("rescue")),
                             db: Session = Depends(get_db)):
    a = _own_assignment(db, assignment_id, user)
    expected = NEXT_STATUS.get(a.status)
    if body.status != expected:
        raise HTTPException(409, f"Cannot move from {a.status} to {body.status}"
                                 + (f" (next step is {expected})" if expected else ""))
    a.status = body.status
    a.incident.status = "Resolved" if body.status == "Completed" else body.status
    if body.status == "Completed":
        a.team.status = "available"
    note = f" Note: {body.note.strip()}" if body.note.strip() else ""
    _log(db, a.incident, user, "status", f"{a.team.name}: {body.status}.{note}")
    db.commit()
    return {**_assignment_out(a), "incident": _incident_out(a.incident)}


# ---------------- hospitals ----------------
@app.get("/api/hospitals", response_model=list[S.HospitalOut], tags=["hospitals"])
def list_hospitals(_: User = Depends(require("dispatcher", "hospital")), db: Session = Depends(get_db)):
    return db.scalars(select(Hospital).order_by(Hospital.id)).all()


@app.get("/api/hospitals/mine", response_model=S.HospitalOut, tags=["hospitals"])
def my_hospital(user: User = Depends(require("hospital")), db: Session = Depends(get_db)):
    return db.get(Hospital, user.hospital_id)


@app.put("/api/hospitals/mine", response_model=S.HospitalOut, tags=["hospitals"])
def update_my_hospital(body: S.HospitalUpdateIn, user: User = Depends(require("hospital")), db: Session = Depends(get_db)):
    if body.available_beds > body.total_beds:
        raise HTTPException(422, "Available beds cannot exceed total beds")
    if body.icu_available > body.icu_total:
        raise HTTPException(422, "Available ICU beds cannot exceed total ICU beds")
    h = db.get(Hospital, user.hospital_id)
    for k, v in body.model_dump().items():
        setattr(h, k, v)
    h.resources_updated_at = now()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Another hospital already uses this name")
    return h


# ---------------- demo data ----------------
@app.post("/api/demo/reset", tags=["demo"])
def demo_reset(_: User = Depends(require("dispatcher")), db: Session = Depends(get_db)):
    if not DEMO_MODE:
        raise HTTPException(403, "Demo reset is disabled (DEMO_MODE=false)")
    from .seed import reset_and_seed
    db.close()
    reset_and_seed()
    return {"ok": True, "message": "Demo data reset. Please log in again."}


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "demo_mode": DEMO_MODE}
