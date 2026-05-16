# AI Agent Design

## Main Agent Responsibilities

- Help clients book, cancel, and reschedule appointments.
- Answer client questions using their routine, goals, and appointment history.
- Draft routines for instructors using client profile data.
- Summarize client progress before instructor sessions.

## Recommended Tool Functions

- `get_client_profile(client_id)`
- `list_instructor_availability(instructor_id, date_range)`
- `create_appointment(client_id, instructor_id, starts_at, ends_at)`
- `generate_routine_draft(client_id, instructor_id, constraints)`
- `save_instructor_notes(client_id, notes)`

## Important Guardrails

- AI-generated routines should stay in draft status until an instructor approves them.
- The assistant should avoid medical claims and refer injury or pain concerns to a qualified professional.
- Appointment actions should confirm date, time, instructor, and cancellation policy before committing.
- Client data should be scoped by role: clients see their own data, instructors see assigned clients, admins see all.

## Suggested Milestones

1. Build manual appointment and routine CRUD.
2. Add auth and roles.
3. Add AI draft generation with instructor approval.
4. Add assistant tool calling for scheduling.
5. Add reminders and progress summaries.
