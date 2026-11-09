# ResQNet API

Base URL: `http://localhost:8000/api`. Interactive docs (generated from the code): **http://localhost:8000/docs**.

All endpoints except `register`, `login`, `classification/rules` and `health` need the header
`Authorization: Bearer <access_token>`. A missing or invalid token returns **401**. The wrong role returns **403**.
A record you are not allowed to see returns **404**, so the API doesn't reveal that it exists. Validation errors return **422** and state conflicts return **409**.
Timestamps are UTC ISO-8601 without an offset.

## Auth

| Method | Path | Role | Body | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{name, email, phone?, password}` | Creates a **citizen** account only. Password needs at least 8 characters, with letters and digits. Returns a token. |
| POST | `/auth/login` | public | `{email, password}` | Returns `{access_token, token_type, user}` |
| GET | `/auth/me` | any | – | Current user (never includes the password hash) |

## Incidents

| Method | Path | Role | Body / query | Notes |
|---|---|---|---|---|
| POST | `/incidents` | citizen | `{incident_type, description, reported_severity, people_affected, location_text, lat, lng, contact_phone?}` | Validates input, classifies priority and generates `code` (e.g. `RQN-261109-0007`) |
| GET | `/incidents` | citizen · rescue · dispatcher | `?priority=&type=&status=&active=true\|false` | Citizens get only their own incidents, rescue teams only incidents assigned to their team, dispatchers get all |
| GET | `/incidents/{id}` | same scoping | – | Returns the incident with `assignments[]` and the `updates[]` timeline |
| GET | `/classification/rules` | public | – | Machine-readable scoring rules + disclaimer |
| POST | `/classification/preview` | any | `{incident_type, reported_severity, people_affected, description}` | Returns `{priority, score, reason}` without saving anything |

Enum values:
- `incident_type`: Road Accident, Medical Emergency, Fire, Building Collapse, Flooding, Other
- `reported_severity`: Minor, Moderate, Serious, Life-threatening
- `priority`: Low, Medium, High, Critical
- incident `status`: Reported → Assigned → En Route → On Scene → Resolved → Closed

## Dispatcher

| Method | Path | Body | Notes |
|---|---|---|---|
| PATCH | `/incidents/{id}/priority` | `{priority, reason}` | Overrides the suggested priority. The reason is required and is logged to the timeline. |
| POST | `/incidents/{id}/assign` | `{team_id}` | Team must be `available` and the incident open, with no active assignment. Sets team → `busy` and incident → `Assigned`. |
| POST | `/incidents/{id}/close` | `{note?}` | **409** while a team is still active. A note is required unless the status is `Resolved`. |
| GET | `/stats` | – | Totals, active, critical, unassigned, team/hospital capacity, breakdowns and a 7-day trend |
| GET | `/teams` | – | All rescue teams (a rescue user sees only its own team) |
| GET | `/hospitals` | – | All hospitals with reported availability (also readable by hospital admins and rescue teams) |
| POST | `/demo/reset` | – | Wipes the database and reloads the demo data. Only works when `DEMO_MODE=true`. |

## Rescue team

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/assignments/mine` | – | The team's assignments, newest first, each with its `incident` |
| POST | `/assignments/{id}/respond` | `{accept: bool, reason?}` | Only from `Assigned`. **Rejecting needs a reason.** A rejection returns the incident to `Reported` and frees the team. |
| POST | `/assignments/{id}/status` | `{status, note?}` | Must follow `Accepted → En Route → On Scene → Completed` in order. Each step updates the incident's status (`Completed` → `Resolved`). `Completed` frees the team. |

Assignment statuses: Assigned, Accepted, Rejected, En Route, On Scene, Completed, Cancelled.

## Hospital administrator

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/hospitals/mine` | – | The admin's own hospital |
| PUT | `/hospitals/mine` | `{name, address, phone, lat, lng, total_beds, available_beds, icu_total, icu_available, ed_status, ed_wait_minutes, specialties, notes}` | Available counts can't exceed the totals. `ed_status` is one of Open, Limited, Diverting, Closed. Sets `resources_updated_at` to now. No hospital id is accepted, so an admin can only update their own hospital. |

## Example

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"citizen@resqnet.demo","password":"Demo@1234"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST localhost:8000/api/incidents -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"incident_type":"Fire","description":"Smoke from 2nd floor kitchen, child trapped","reported_severity":"Serious","people_affected":3,"location_text":"Rose Apartments","lat":17.41,"lng":78.47}'
```
