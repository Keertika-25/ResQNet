# ResQNet – Intelligent Emergency Response and Rescue Coordination System

An academic full-stack prototype. It is **one** connected emergency-coordination system with four role-based views of the same database:
**Citizens** report emergencies, **Dispatchers** prioritise them and assign teams, **Rescue Teams** respond and update their status, and **Hospital Administrators** publish bed, ICU and ED capacity.

> ⚠️ **Prototype only.** ResQNet never contacts real emergency services and never sends real calls or messages.
> The priority classification is a transparent rule-based aid, **not** a medical triage system.

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + TypeScript, Tailwind CSS, React Router, Leaflet / OpenStreetMap (2D maps), MapLibre GL + OpenFreeMap OSM vector tiles (3D command map), OSRM public router (road routes), Recharts |
| Backend | Python FastAPI, SQLAlchemy 2, Pydantic 2 |
| Database | SQLite (`backend/resqnet.db`) |
| Auth | scrypt password hashing (Python stdlib), JWT bearer tokens (HS256), role-based access on every endpoint |

---

## 1. Setup

Prerequisites: **Python 3.11+** and **Node.js 18+**.

### Backend
```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate      macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then set SECRET_KEY (see the comment in the file)
uvicorn app.main:app --reload --env-file .env --port 8000
```
On first start the tables are created and the demo data is loaded automatically (`SEED_ON_STARTUP=true`).
The API is now on http://localhost:8000. Swagger docs are at http://localhost:8000/docs.

### Frontend (in a second terminal)
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. The Vite dev server proxies `/api` to the backend.

Production build: `npm run build`, which outputs to `frontend/dist`.

## 2. Demo data

| Role | Email | Password |
|---|---|---|
| Citizen | `citizen@resqnet.demo` | `Demo@1234` |
| Citizen (2nd) | `citizen2@resqnet.demo` | `Demo@1234` |
| Dispatcher | `dispatcher@resqnet.demo` | `Demo@1234` |
| Rescue – Fire & Rescue Unit Alpha | `rescue1@resqnet.demo` | `Demo@1234` |
| Rescue – Ambulance Unit Medic-7 | `rescue2@resqnet.demo` | `Demo@1234` |
| Hospital admin – City General Hospital | `hospital1@resqnet.demo` | `Demo@1234` |
| Hospital admin – Lakeview Medical Centre | `hospital2@resqnet.demo` | `Demo@1234` |

All names, places and phone numbers are fictional. The seed contains 2 hospitals, 2 rescue teams and 6 incidents covering every priority (Critical, High, Medium, Low) and several statuses: unassigned, en route, resolved and closed.

The login page has one-click buttons that fill in these accounts.

**Reset or repopulate the demo data:**
- CLI: `cd backend && python -m app.seed` drops all tables and reloads the demo data.
- UI: on the Dispatcher dashboard, click **Reset demo**. This calls `POST /api/demo/reset` and only works when `DEMO_MODE=true`.
- Or delete `backend/resqnet.db` and restart the backend.

> Login sessions are stored **per browser tab** (sessionStorage). This lets you open several tabs and sign in as a citizen, the dispatcher, a rescue team and a hospital side by side to watch updates flow between them.

## 3. End-to-end walkthrough

1. **Citizen** (tab 1): *Report Emergency*. Pick a type and severity, describe the incident, then click the map (or type coordinates, or use *Use my location*). The suggested priority and the reasoning behind it update live as you type. Submit to get an incident ID such as `RQN-261109-0007`.
2. **Dispatcher** (tab 2): the incident appears in the **Live alert queue**, on the map and in the table within 5 seconds. Click it, then:
   - **Override priority**, with a reason that is logged to the timeline.
   - **Assign** an available team. The list shows each team's distance from the incident, and the panel shows the nearest hospitals with live bed and ICU figures.
3. **Rescue team** (tab 3, `rescue2`): the assignment appears. **Accept** it, or **Reject** it with a reason (the incident then goes back to the dispatcher queue). Then mark it **En Route → On Scene → Completed**.
4. Each status change appears on the dispatcher map, queue and table, and on the citizen's *My Incidents* page with a progress stepper and timeline.
5. **Dispatcher** closes the resolved incident.
6. **Hospital admin** (tab 4): changes available beds, ICU beds and ED status, or clicks *Confirm figures are current*. The dispatcher's *Hospital capacity* panel and its KPI cards show the new figures and the new timestamp.

## 4. Priority classification (rule-based, transparent)

`backend/app/classify.py`. The score is the sum of four parts:

| Factor | Points |
|---|---|
| Reported severity | Minor 0 · Moderate 2 · Serious 4 · Life-threatening 6 |
| Incident type | Building Collapse 3 · Fire 2 · Medical / Road Accident / Flooding 1 · Other 0 |
| People affected | ≥10 → 3 · 3–9 → 2 · 2 → 1 · 1 → 0 |
| Critical keywords in description (unconscious, not breathing, trapped, bleeding, explosion, cardiac, chest pain, child, spreading, collapsed, drowning, burn) | +2 |

**Critical ≥ 9 · High ≥ 6 · Medium ≥ 3 · Low < 3.** Each incident stores the suggested priority, the score and the explanation. A dispatcher override is stored separately (`priority`, `priority_overridden`) and logged to the timeline.

## 5. Database schema

The tables are created by SQLAlchemy (`backend/app/db.py` → `init_db()`). Foreign keys are enforced (`PRAGMA foreign_keys=ON`), and CHECK constraints guard enums, coordinates and bed counts.

```
users            id PK, name, email UNIQUE, phone, password_hash, role CHECK(citizen|dispatcher|rescue|hospital),
                 team_id FK→rescue_teams (required when role=rescue), hospital_id FK→hospitals (required when role=hospital), created_at
rescue_teams     id PK, name UNIQUE, team_type, members, phone, base_lat, base_lng, status CHECK(available|busy|off_duty)
hospitals        id PK, name UNIQUE, address, phone, lat, lng, total_beds, available_beds ≤ total_beds,
                 icu_total, icu_available ≤ icu_total, ed_status CHECK(Open|Limited|Diverting|Closed), ed_wait_minutes,
                 specialties, notes, resources_updated_at
incidents        id PK, code UNIQUE (RQN-YYMMDD-NNNN), reporter_id FK→users, incident_type, description, reported_severity,
                 people_affected, location_text, lat, lng, contact_phone, auto_priority, priority, priority_score,
                 priority_reason, priority_overridden, status, created_at, updated_at, closed_at
assignments      id PK, incident_id FK→incidents (CASCADE), team_id FK→rescue_teams, assigned_by_id FK→users,
                 status CHECK(Assigned|Accepted|Rejected|En Route|On Scene|Completed|Cancelled), response_reason, created_at, updated_at
incident_updates id PK, incident_id FK→incidents (CASCADE), author_id FK→users, kind, message, created_at   ← audit timeline
```

## 6. Security

- Passwords are hashed with **scrypt** and a random salt per user, then checked with a constant-time comparison. Hashes are never returned by any endpoint.
- **JWT** bearer tokens are signed with `SECRET_KEY` and expire after `ACCESS_TOKEN_MINUTES`.
- **Role checks** run on every endpoint (`require(...)`), and data is scoped per user:
  - Citizens only see their own incidents. Anyone else's returns 404.
  - Rescue teams only see and change their own team's assignments.
  - Hospital admins can only update their own hospital. The endpoint takes no hospital id.
  - Only dispatchers can override priority, assign, close, view stats or reset the demo.
  - Only citizen accounts can self-register. All other roles are provisioned.
- Pydantic validates every input: enums, lengths, coordinate ranges and bed totals. Database CHECK constraints back this up.
- Secrets come from `.env`, which is git-ignored. Only `.env.example` is committed.

## 7. Tests

```bash
cd backend
python -m pytest -q        # 6 tests on a throwaway database
python -m app.classify     # classifier self-check
```
The tests cover authentication (bad password, bad token, duplicate and weak registrations), role isolation, input validation and classification. They also run one end-to-end workflow: report, override, assign (a busy team is refused), reject with a reason, reassign, accept, step through the statuses in order (skipping a step is refused), visibility to the citizen and dispatcher, team freed, close, and timeline. Finally they check hospital updates: totals enforced, timestamp bumped, and the change visible to the dispatcher.

## 8. Project structure

```
backend/
  app/main.py        API routes and the workflow rules
  app/db.py          engine and ORM models (6 tables)
  app/security.py    hashing, JWT, role dependencies
  app/classify.py    rule-based priority classifier
  app/schemas.py     request validation and response models
  app/seed.py        fictional demo data and reset
  tests/test_api.py
frontend/src/
  api.ts, auth.tsx           API client, types, session, polling hook
  components/                Layout (navy sidebar), MapView (Leaflet), UI kit
  pages/Login.tsx            screen 1 – login / register
  pages/Citizen.tsx          screen 2 – report, my incidents, tracking
  pages/Dispatcher.tsx       screen 3 – command center (KPIs, queue, map, table, charts, incident panel)
  pages/Rescue.tsx           screen 4 – assignments and status updates
  pages/Hospital.tsx         screen 5 – hospital resource management
docs/API.md                  API reference
```

## 9. Known limitations (prototype scope)

- 3D command map: buildings come from OpenStreetMap, which has no height tag for most buildings. Untagged buildings get a stable pseudo-height so the scene reads as a city; this is not real elevation data. Routes use the public OSRM demo server, and the map falls back to a straight line if it can't be reached. Vehicle position is estimated from the time since the status changed. If WebGL isn't available, the map falls back to the 2D Leaflet map.

- Dashboards refresh by polling every 5 seconds. A WebSocket push would be the upgrade path.
- Only one active team per incident. Multi-unit responses are not modelled.
- Distances are straight-line (haversine), not road routes. Team positions are their base locations, not live GPS.
- The schema is created with `create_all` rather than versioned migrations. Add Alembic if the schema needs to evolve with existing data.
- There is no login rate-limiting and no account management UI for non-citizen roles.
