# Gym AI Assistant

Multi-role gym platform: trainers manage their clients' plans, measurements, and weekly workouts; clients log their own sessions and book appointments with their assigned trainer.

## Tech stack

- **Backend** — FastAPI, SQLAlchemy 2 (typed mappers), PostgreSQL, JWT auth (HS256), bcrypt password hashing
- **Frontend** — React 19, TypeScript 5.6, Vite 6, lucide-react icons
- **Storage** — PostgreSQL with the `astrok` schema (see [`database/schema.sql`](database/schema.sql))

## Features

- **Auth** — JWT tokens, role-aware sidebar, automatic logout when any API call returns 401
- **Clients** — trainer-scoped list with search, detail view with editable notes, create-client flow that bundles basic info + initial measures + first plan in one atomic save
- **Measurements** — editable per-client table with diff saves (changes and removals tracked separately), append-only history per reading
- **Plans** — full content editor (title, status, description, day-by-day exercises with peso/repeticiones/URL video), versioned snapshots on every edit via `plan_versions`
- **Plan Sessions** — week-aware workout logging; clients see Prescribed / Last / Today columns, 1–5 star rating modal on completion, "Already completed for this week" banner; trainers see read-only session history per client
- **Appointments** — 7×14 booking grid (5 AM – 7 PM, 1-hour slots, up to 4 weeks ahead), overlap prevention, client books with their assigned professional, trainer can book on behalf of any of their clients
- **Responsive** — desktop sidebar collapses to a top bar at ≤900px; detail tables become card stacks at ≤600px

## Project structure

```
backend/
  app/
    api/             # FastAPI routers
      appointments.py, assistant.py, auth.py, clients.py, deps.py,
      measurements.py, plans.py, routes.py, sessions.py, users.py
    core/            # config, database engine, security helpers
    models/          # SQLAlchemy 2 typed mappers
      appointment.py, client_measurement.py, plan.py,
      plan_version.py, user.py, user_relation.py,
      workout_session.py
    schemas/         # Pydantic request/response models
    services/        # history helpers (plan versioning, measurement append)
    main.py
  pyproject.toml
database/
  schema.sql           # base PostgreSQL schema + roles, permissions, bootstrap admin
  seed-dev-users.sql   # demo trainers/clients with shared password (dev only)
docs/
  ai-agent-design.md
frontend/
  src/
    modules/
      appointments/  # week grid + booking dialog
      auth/          # login
      clients/       # list, detail, new-client form
      dashboard/     # landing page (placeholder)
      sessions/      # weekly workout logging + trainer review
    App.tsx, api.ts, styles.css
```

## Quick start

### Prerequisites

- **PostgreSQL** ≥14 (built against 18)
- **Python** 3.11+
- **Node** 20+

### Database

```sql
CREATE DATABASE gym_training;
CREATE USER gym_admin WITH PASSWORD 'gym_admin';
GRANT ALL PRIVILEGES ON DATABASE gym_training TO gym_admin;
```

Load the base schema (creates tables in the `astrok` namespace, seeds roles + permissions, and creates a bootstrap admin):

```powershell
psql -h localhost -U gym_admin -d gym_training -f database/schema.sql
```

The bootstrap admin from `schema.sql` is:

| username | password |
|---|---|
| `admin` | `ChangeMe123!` |

**Change that password on first login.** For production deploys, that admin is your only way in until you create more users through the app.

For local development you probably also want the demo fixtures (Carlos / Mariana / Ana / etc.) — load them with:

```powershell
psql -h localhost -U gym_admin -d gym_training -f database/seed-dev-users.sql
```

All dev users share the password `Password123!`. **Do not run this against a production database.**

The backend sets `search_path = astrok,public` on every connection, so the `astrok` prefix isn't needed in app queries.

### Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .

Copy-Item .env.postgres.example .env
# Edit .env — at minimum set DATABASE_URL and JWT_SECRET_KEY

uvicorn app.main:app --reload
```

`.env` keys the backend reads (`backend/app/core/config.py`):

```env
DATABASE_URL="postgresql+psycopg://gym_admin:gym_admin@localhost:5432/gym_training"
DATABASE_SCHEMA="astrok"
JWT_SECRET_KEY="change-this-secret"
ACCESS_TOKEN_EXPIRE_MINUTES=60
FRONTEND_ORIGIN="http://localhost:5173"
```

### Frontend

```powershell
cd frontend
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Default frontend URL: `http://localhost:5173`. The app reads `VITE_API_URL` from `frontend/.env` (defaults to `http://localhost:8000`).

## Demo accounts

The dev environment uses these accounts. All trainers and clients share the password **`Password123!`** — **demo only, do not reuse in any deployment**.

| Role | Username | Email |
|---|---|---|
| trainer | `carlos` | carlos@example.com |
| trainer | `mariana` | mariana@example.com |
| trainer | `daniela` | daniela@example.com |
| client | `ana.morales` | ana.morales@example.com |
| client | `luis.vega` | luis.vega@example.com |
| client | `sofia.rojas` | sofia.rojas@example.com |
| client | `mateo.blanco` | mateo.blanco@example.com |
| client | `valentina.herrera` | valentina.herrera@example.com |
| client | `diego.castillo` | diego.castillo@example.com |
| client | `camila.ortiz` | camila.ortiz@example.com |
| client | `sebastian.ramirez` | sebastian.ramirez@example.com |
| client | `lucia.mendoza` | lucia.mendoza@example.com |
| client | `andres.navarro` | andres.navarro@example.com |

There's also an admin account (`juand645`) used during development; its password is set out-of-band, not the shared demo password.

> **Heads-up:** `database/schema.sql` only seeds the base roles, permissions, and the bootstrap `admin` account. The full dev cast above lives in `database/seed-dev-users.sql` (apply that for local dev parity). On a fresh production database, log in as `admin` / `ChangeMe123!`, change the password, and create your real trainers/clients through the UI.

## Module overview

The sidebar branches by role:

| Tab | Visible to | What it does |
|---|---|---|
| Dashboard | everyone | Landing screen — trainer dashboard (stats + upcoming + action queue) or client dashboard (next session, week summary) |
| Clients | non-clients | Trainer's client list, search, detail editor, transfer, soft-delete, new-client form |
| Trainers | admin | Manage trainer accounts: create, edit, soft-delete, reactivate |
| Plan Sessions | everyone | Clients log weekly workouts; trainers browse read-only session history per client |
| Appointments | everyone | Hourly week grid with mini-calendar sidebar; trainers can drag-select slots as OOO; clients book/cancel |
| Health | clients | PAR-Q questionnaire |
| Profile | everyone | Edit own profile, change password, upload avatar |

## Architecture notes

Things worth knowing before changing anything:

- **`astrok` schema, not `public`.** The backend pins `search_path = astrok,public` per connection. SQLAlchemy's `Base.metadata.schema = "astrok"` keeps the ORM aligned.
- **No migrations tool yet.** Schema changes are applied via direct SQL against the DB. `Base.metadata.create_all()` runs on startup but only creates *missing* tables — it doesn't add columns or alter types.
- **Workout sessions cap at 2 per `(plan, day_key)`.** When a new session is logged on a day that already has 2 history rows, the oldest is deleted in the same transaction. Lives in `app/api/sessions.py`.
- **In-progress sessions overwrite within the same week.** Saving an in-progress session that already exists for this week mutates that row instead of creating a new one. Once `completed=true`, the row is "frozen" and the next save creates a fresh row.
- **Plan edits create a new version.** Every `PATCH /api/plans/{id}` writes a `plan_versions` snapshot via `services/history.save_plan_version`. Includes content, title (in cache only — not snapshotted), description, and status.
- **Measurements are merged.** `POST /api/clients/{id}/measurements` accepts `measures` (to add/update) and `removed` (to drop keys). The endpoint merges the additions and pops the removals from the `users.measures` cache, and only writes a history row when `measures` is non-empty.
- **Auto-logout on 401.** Every authenticated fetcher in `frontend/src/api.ts` calls `notifyIfSessionExpired(response)` on a 401, which dispatches a `window` event. `App.tsx` listens while a session is active and runs `handleLogout`.
- **Soft "completed this week" lock.** Once a client marks a session complete for the week, the UI shows an "Already completed for this week" banner but inputs remain editable (so they can fix typos). The confirmation dialog only fires on the *first* transition to completed.

## Known limitations / next steps

- **Authorization gaps on some endpoints.** `/api/users/*` is currently unauthenticated. Tighten before any non-local deployment.
- **No email/SMS reminders.** Appointments table is ready; needs a transactional email provider (Resend recommended) + scheduler (APScheduler in-process is the lightweight option).
- **No Google Calendar / external sync.** Per-trainer OAuth would be the cleanest path.
- **No DELETE for plans, sessions, or appointments.** Cancellations only flip status; there's no hard-delete endpoint.
- **Time zones rely on server local time.** Single-machine dev is fine; multi-region deployment would require carrying the user's tz through booking + reminder logic.
- **AI assistant is a stub.** `services/ai_agent.py` returns canned strings; no real LLM call.
- **Mobile app.** The web SPA is responsive but not packaged. Capacitor is the recommended wrapper if you ever want an APK.
- **No tests yet.** Backend logic is verified via ad-hoc smoke runs in PowerShell during development.
