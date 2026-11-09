"""End-to-end API tests on a throwaway SQLite DB. Run: python -m pytest -q"""
import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.classify import classify  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, reset_and_seed  # noqa: E402

REPORT = {"incident_type": "Fire", "description": "Kitchen fire spreading, child trapped inside flat",
          "reported_severity": "Life-threatening", "people_affected": 3, "location_text": "Block C, Rose Apartments",
          "lat": 17.41, "lng": 78.47}


@pytest.fixture()
def client():
    reset_and_seed()
    with TestClient(app) as c:
        yield c


def login(c, who):
    r = c.post("/api/auth/login", json={"email": f"{who}@resqnet.demo", "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    assert "password" not in r.text.lower()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_auth(client):
    assert client.post("/api/auth/login", json={"email": "citizen@resqnet.demo", "password": "wrong"}).status_code == 401
    assert client.get("/api/incidents").status_code == 401
    assert client.get("/api/incidents", headers={"Authorization": "Bearer garbage"}).status_code == 401
    r = client.post("/api/auth/register", json={"name": "New Person", "email": "new@x.org", "password": "abc12345"})
    assert r.status_code == 201 and r.json()["user"]["role"] == "citizen"
    assert client.post("/api/auth/register", json={"name": "Dup", "email": "new@x.org", "password": "abc12345"}).status_code == 409
    assert client.post("/api/auth/register", json={"name": "Weak", "email": "w@x.org", "password": "short"}).status_code == 422
    assert client.get("/api/auth/me", headers=login(client, "dispatcher")).json()["role"] == "dispatcher"


def test_role_access(client):
    cit, hosp, res = login(client, "citizen"), login(client, "hospital1"), login(client, "rescue1")
    assert client.get("/api/stats", headers=cit).status_code == 403
    assert client.get("/api/incidents", headers=hosp).status_code == 403
    assert client.post("/api/incidents", json=REPORT, headers=res).status_code == 403
    assert client.put("/api/hospitals/mine", json={}, headers=cit).status_code == 403
    # citizens see only their own incidents
    mine = client.get("/api/incidents", headers=cit).json()
    other = client.get("/api/incidents", headers=login(client, "citizen2")).json()
    assert mine and other and not {i["id"] for i in mine} & {i["id"] for i in other}
    assert client.get(f"/api/incidents/{other[0]['id']}", headers=cit).status_code == 404


def test_classification():
    assert classify("Fire", "Life-threatening", 4, "people trapped")[0] == "Critical"
    assert classify("Road Accident", "Serious", 2, "two cars collided")[0] == "High"
    assert classify("Flooding", "Moderate", 1, "water logging")[0] == "Medium"
    assert classify("Other", "Minor", 1, "fallen branch")[0] == "Low"


def test_report_validation(client):
    cit = login(client, "citizen")
    assert client.post("/api/incidents", json={**REPORT, "description": "short"}, headers=cit).status_code == 422
    assert client.post("/api/incidents", json={**REPORT, "lat": 123}, headers=cit).status_code == 422
    assert client.post("/api/incidents", json={**REPORT, "incident_type": "Alien"}, headers=cit).status_code == 422


def test_full_workflow(client):
    cit, disp, res2 = login(client, "citizen"), login(client, "dispatcher"), login(client, "rescue2")
    # 1. citizen reports -> real record with unique id and auto priority
    inc = client.post("/api/incidents", json=REPORT, headers=cit).json()
    assert inc["code"].startswith("RQN-") and inc["priority"] == "Critical" and inc["status"] == "Reported"
    iid = inc["id"]
    # 2. dispatcher sees it and overrides priority
    assert iid in [i["id"] for i in client.get("/api/incidents?active=true", headers=disp).json()]
    assert iid in [i["id"] for i in client.get("/api/incidents?priority=Critical&type=Fire", headers=disp).json()]
    r = client.patch(f"/api/incidents/{iid}/priority", json={"priority": "High", "reason": "Fire contained per caller"}, headers=disp)
    assert r.json()["priority"] == "High" and r.json()["priority_overridden"]
    # 3. busy team cannot be assigned; available team can
    teams = {t["name"]: t for t in client.get("/api/teams", headers=disp).json()}
    assert client.post(f"/api/incidents/{iid}/assign", json={"team_id": teams["Fire & Rescue Unit Alpha"]["id"]}, headers=disp).status_code == 409
    medic = teams["Ambulance Unit Medic-7"]["id"]
    assert client.post(f"/api/incidents/{iid}/assign", json={"team_id": medic}, headers=disp).json()["status"] == "Assigned"
    # 4. rescue team sees it; reject requires reason; rejection returns it to queue
    a = next(x for x in client.get("/api/assignments/mine", headers=res2).json() if x["incident_id"] == iid)
    assert client.post(f"/api/assignments/{a['id']}/respond", json={"accept": False}, headers=res2).status_code == 422
    client.post(f"/api/assignments/{a['id']}/respond", json={"accept": False, "reason": "Vehicle breakdown"}, headers=res2)
    assert client.get(f"/api/incidents/{iid}", headers=cit).json()["status"] == "Reported"
    # 5. reassign, accept, progress through statuses (no skipping)
    client.post(f"/api/incidents/{iid}/assign", json={"team_id": medic}, headers=disp)
    a = next(x for x in client.get("/api/assignments/mine", headers=res2).json() if x["status"] == "Assigned")
    assert client.post(f"/api/assignments/{a['id']}/respond", json={"accept": True}, headers=res2).json()["status"] == "Accepted"
    assert client.post(f"/api/assignments/{a['id']}/status", json={"status": "Completed"}, headers=res2).status_code == 409
    assert client.post(f"/api/incidents/{iid}/close", json={"note": "x"}, headers=disp).status_code == 409  # team still active
    for s, inc_status in (("En Route", "En Route"), ("On Scene", "On Scene"), ("Completed", "Resolved")):
        assert client.post(f"/api/assignments/{a['id']}/status", json={"status": s}, headers=res2).status_code == 200
        assert client.get(f"/api/incidents/{iid}", headers=cit).json()["status"] == inc_status  # citizen sees it
        assert client.get(f"/api/incidents/{iid}", headers=disp).json()["status"] == inc_status  # dispatcher too
    assert {t["name"]: t["status"] for t in client.get("/api/teams", headers=disp).json()}["Ambulance Unit Medic-7"] == "available"
    # 6. dispatcher closes; timeline recorded
    closed = client.post(f"/api/incidents/{iid}/close", json={}, headers=disp).json()
    assert closed["status"] == "Closed" and closed["closed_at"]
    kinds = [u["kind"] for u in closed["updates"]]
    assert kinds[0] == "created" and kinds[-1] == "closed" and "priority" in kinds
    # other rescue team cannot touch this assignment
    assert client.post(f"/api/assignments/{a['id']}/status", json={"status": "En Route"}, headers=login(client, "rescue1")).status_code == 404


def test_hospital_updates(client):
    h1, disp = login(client, "hospital1"), login(client, "dispatcher")
    mine = client.get("/api/hospitals/mine", headers=h1).json()
    body = {k: mine[k] for k in ("name", "address", "phone", "lat", "lng", "total_beds", "icu_total", "specialties", "notes")}
    body |= {"available_beds": 7, "icu_available": 2, "ed_status": "Diverting", "ed_wait_minutes": 90}
    assert client.put("/api/hospitals/mine", json={**body, "available_beds": 9999}, headers=h1).status_code == 422
    r = client.put("/api/hospitals/mine", json=body, headers=h1)
    assert r.status_code == 200 and r.json()["resources_updated_at"] > mine["resources_updated_at"]
    seen = {h["id"]: h for h in client.get("/api/hospitals", headers=disp).json()}[mine["id"]]
    assert (seen["available_beds"], seen["icu_available"], seen["ed_status"]) == (7, 2, "Diverting")
    # hospital admins can only update their own hospital (no id in the route; second admin edits its own)
    other = client.get("/api/hospitals/mine", headers=login(client, "hospital2")).json()
    assert other["id"] != mine["id"] and other["available_beds"] != 7
