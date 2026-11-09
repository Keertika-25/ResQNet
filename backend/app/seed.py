"""Fictional demo data. Run `python -m app.seed` to reset the database and re-populate it."""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .classify import classify
from .db import (Assignment, Base, Hospital, Incident, IncidentUpdate, RescueTeam, SessionLocal, User, engine, now)
from .security import hash_password

DEMO_PASSWORD = "Demo@1234"  # fictional accounts only


def seed(db: Session):
    t = now()
    h1 = Hospital(name="City General Hospital", address="12 Hospital Road, Central District", phone="040-5550-1001",
                  lat=17.4065, lng=78.4772, total_beds=220, available_beds=34, icu_total=24, icu_available=5,
                  ed_status="Open", ed_wait_minutes=20, specialties="Trauma, Burns, Cardiology",
                  resources_updated_at=t - timedelta(minutes=35))
    h2 = Hospital(name="Lakeview Medical Centre", address="88 Lakeside Avenue, North District", phone="040-5550-2002",
                  lat=17.4239, lng=78.4483, total_beds=140, available_beds=9, icu_total=12, icu_available=1,
                  ed_status="Limited", ed_wait_minutes=55, specialties="Orthopaedics, Paediatrics, Neurology",
                  notes="CT scanner under maintenance until 18:00.", resources_updated_at=t - timedelta(hours=2))
    t1 = RescueTeam(name="Fire & Rescue Unit Alpha", team_type="Fire & Rescue", members=6, phone="040-5550-3101",
                    base_lat=17.3950, base_lng=78.4700, status="busy")
    t2 = RescueTeam(name="Ambulance Unit Medic-7", team_type="Ambulance / Medical", members=3, phone="040-5550-3207",
                    base_lat=17.4300, base_lng=78.5000, status="available")
    db.add_all([h1, h2, t1, t2])
    db.flush()

    pw = hash_password(DEMO_PASSWORD)
    citizen = User(name="Ananya Rao", email="citizen@resqnet.demo", phone="90000-11111", password_hash=pw, role="citizen")
    citizen2 = User(name="Rahul Mehta", email="citizen2@resqnet.demo", phone="90000-22222", password_hash=pw, role="citizen")
    dispatcher = User(name="Dispatcher Kavya Iyer", email="dispatcher@resqnet.demo", password_hash=pw, role="dispatcher")
    db.add_all([citizen, citizen2, dispatcher,
                User(name="Alpha Team Lead", email="rescue1@resqnet.demo", password_hash=pw, role="rescue", team_id=t1.id),
                User(name="Medic-7 Lead", email="rescue2@resqnet.demo", password_hash=pw, role="rescue", team_id=t2.id),
                User(name="City General Admin", email="hospital1@resqnet.demo", password_hash=pw, role="hospital", hospital_id=h1.id),
                User(name="Lakeview Admin", email="hospital2@resqnet.demo", password_hash=pw, role="hospital", hospital_id=h2.id)])
    db.flush()

    def incident(reporter, kind, severity, people, desc, place, lat, lng, age, status):
        prio, score, reason = classify(kind, severity, people, desc)
        created = t - age
        inc = Incident(reporter_id=reporter.id, incident_type=kind, reported_severity=severity, people_affected=people,
                       description=desc, location_text=place, lat=lat, lng=lng, contact_phone=reporter.phone,
                       auto_priority=prio, priority=prio, priority_score=score, priority_reason=reason, status=status,
                       created_at=created, updated_at=created)
        db.add(inc)
        db.flush()
        inc.code = f"RQN-{created:%y%m%d}-{inc.id:04d}"
        db.add(IncidentUpdate(incident_id=inc.id, author_id=reporter.id, kind="created", created_at=created,
                              message=f"Incident reported. Suggested priority: {prio}."))
        return inc

    def history(inc, team, steps, start):
        a = Assignment(incident_id=inc.id, team_id=team.id, assigned_by_id=dispatcher.id, status=steps[-1],
                       created_at=start, updated_at=start + timedelta(minutes=5 * len(steps)))
        db.add(a)
        db.add(IncidentUpdate(incident_id=inc.id, author_id=dispatcher.id, kind="assignment", created_at=start,
                              message=f"{team.name} assigned by dispatcher."))
        for n, s in enumerate(steps[1:], 1):
            msg = f"{team.name} accepted the assignment." if s == "Accepted" else f"{team.name}: {s}."
            db.add(IncidentUpdate(incident_id=inc.id, kind="assignment" if s == "Accepted" else "status",
                                  created_at=start + timedelta(minutes=5 * n), message=msg))

    fire = incident(citizen, "Fire", "Life-threatening", 6,
                    "Fire on the 3rd floor of a commercial complex. Smoke spreading, people trapped near stairwell.",
                    "Metro Plaza, Station Road", 17.3984, 78.4880, timedelta(minutes=25), "En Route")
    history(fire, t1, ["Assigned", "Accepted", "En Route"], fire.created_at + timedelta(minutes=3))
    incident(citizen2, "Medical Emergency", "Life-threatening", 1,
             "Elderly man collapsed at bus stop, complaining of chest pain, now unconscious.",
             "Bus stop near Gandhi Park", 17.4155, 78.4620, timedelta(minutes=8), "Reported")
    incident(citizen, "Road Accident", "Serious", 2,
             "Collision between a two-wheeler and a car. Rider is bleeding from the head.",
             "Junction of Ring Road and 5th Avenue", 17.4302, 78.4785, timedelta(minutes=14), "Reported")
    incident(citizen2, "Flooding", "Moderate", 5,
             "Heavy water logging in the underpass, two cars stuck with water rising slowly.",
             "Railway underpass, Market Street", 17.3870, 78.4580, timedelta(hours=3), "Reported")
    collapse = incident(citizen, "Building Collapse", "Serious", 4,
                        "Partial wall collapse at a construction site, workers injured.",
                        "Site 7, New Colony Layout", 17.4420, 78.4950, timedelta(days=1, hours=2), "Resolved")
    history(collapse, t2, ["Assigned", "Accepted", "En Route", "On Scene", "Completed"],
            collapse.created_at + timedelta(minutes=4))
    branch = incident(citizen2, "Other", "Minor", 1, "Large tree branch fallen across the footpath, blocking pedestrians.",
                      "Lake Promenade, Gate 2", 17.4230, 78.4700, timedelta(days=3), "Closed")
    history(branch, t2, ["Assigned", "Accepted", "En Route", "On Scene", "Completed"],
            branch.created_at + timedelta(minutes=10))
    branch.closed_at = branch.created_at + timedelta(hours=1)
    db.add(IncidentUpdate(incident_id=branch.id, author_id=dispatcher.id, kind="closed", created_at=branch.closed_at,
                          message="Incident closed by dispatcher."))
    db.commit()


def seed_if_empty(db: Session):
    if db.scalar(select(User.id).limit(1)) is None:
        seed(db)


def reset_and_seed():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)


if __name__ == "__main__":
    reset_and_seed()
    print(f"Demo data loaded. All demo accounts use password: {DEMO_PASSWORD}")
