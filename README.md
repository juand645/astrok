# Gym AI Assistant

A starter app for a gym platform where clients can book appointments, instructors can manage their schedule, and an AI assistant helps with scheduling and workout routine generation.

## Product Ideas

- **Client portal:** upcoming appointments, routine history, goals, progress notes, and a chat assistant for rescheduling or asking routine questions.
- **Instructor workspace:** daily calendar, client profiles, generated routine drafts, notes, and approval/edit flow before sharing routines.
- **Appointment management:** availability windows, appointment status, cancellation reasons, reminders, and conflict prevention.
- **Routine builder:** goal-based routine generation using client profile, equipment access, injuries, experience level, and instructor constraints.
- **AI agent:** tool-calling assistant that can read appointment availability, propose times, draft routines, and summarize client progress for instructors.
- **Admin layer:** manage memberships, instructors, class capacity, gym locations, and analytics.

## Tech Stack

- `backend`: FastAPI, SQLAlchemy, SQLite by default.
- `frontend`: React, TypeScript, Vite.

## Structure

```text
backend/
  app/
    api/
    core/
    models/
    schemas/
    services/
frontend/
  src/
docs/
```

## Quick Start

### Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --reload
```

If `py` is not available, use your Python executable directly.

To use PostgreSQL, copy `backend/.env.postgres.example` to `backend/.env` and update the password and database name:

```env
DATABASE_URL="postgresql+psycopg://gym_admin:your_password@localhost:5432/gym"
DATABASE_SCHEMA="astrok"
```

The backend will set the PostgreSQL search path to `astrok,public` and create the schema if the connected user has permission.

### Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

The frontend expects the API at `http://localhost:8000`. Change `VITE_API_URL` in `frontend/.env.example` if needed.

## Next Steps

1. Add authentication and role-based access control.
2. Replace in-memory demo data with migrations and persistent tables.
3. Connect `AIProvider` to a real model API.
4. Add instructor approval workflow for AI-generated routines.
5. Add tests for appointment conflict rules and routine generation inputs.
