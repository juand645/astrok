# Runbook — Migration 007: Non-superuser `app_tenant` role for RLS

This document captures the exact steps used to roll out
[`007_app_tenant_role.sql`](../migrations/007_app_tenant_role.sql) to Railway
Postgres on 2026-07-01. Keep it as a template for future migrations that need
to run against Railway from outside the platform (i.e. without pasting SQL
into the Data tab).

## Why we did this

Migrations 002 and 004 enable Row-Level Security on every tenant table and
add `FORCE ROW LEVEL SECURITY` so even the table owner is subject to policies.
That defense is bypassed when the connecting role has the `BYPASSRLS` flag —
which Railway's default `postgres` user has (it's a `SUPERUSER`). Result: in
production our RLS policies were inert. A bug or compromise in an endpoint's
gym-scoping could return rows from another tenant, and the DB would happily
serve them.

Migration 007 fixes this by creating a `LOGIN, NOSUPERUSER, NOBYPASSRLS,
NOCREATEDB, NOCREATEROLE` role named `app_tenant`, granting it the minimum
runtime privileges (DML on every table + USAGE on schemas + sequences), and
setting default privileges so future migrations don't need a re-grant.
Once `DATABASE_URL` is swapped to `app_tenant`, RLS becomes a real second
layer of defense in production.

## Prerequisites

- The app's local `.venv` has `psycopg` installed (already true — it's an
  app dependency).
- You know the Railway `postgres` superuser password. It lives in Railway →
  Postgres service → Variables → `POSTGRES_PASSWORD`, and is baked into the
  service `DATABASE_URL` variable.
- You know the Railway **public** TCP proxy host + port. Find it at Railway
  → Postgres service → Data tab → Connect → **Public Network**. Looks like
  `viaduct.proxy.rlwy.net:XXXXX`. On 2026-07-01 the port was `18981`.

The **internal** hostname (`postgres.railway.internal`) only resolves inside
Railway's private network and cannot be used from a laptop.

## Step 1 — Dry-run against Railway

Before touching anything, verify the connection works, that `app_tenant`
does not already exist with wrong flags, and that the schema is where you
expect:

```powershell
backend\.venv\Scripts\python.exe -c "
import psycopg
url = 'postgresql://postgres:<POSTGRES_PASSWORD>@viaduct.proxy.rlwy.net:18981/railway'
with psycopg.connect(url, autocommit=True) as con:
    with con.cursor() as cur:
        cur.execute('SELECT current_user, current_database(), current_setting(\'server_version\')')
        print(cur.fetchone())
        cur.execute(\"SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='app_tenant'\")
        print('app_tenant:', cur.fetchall() or 'does not exist')
        cur.execute(\"SELECT nspname FROM pg_namespace WHERE nspname='astrok'\")
        print('astrok schema:', cur.fetchone())
        for t in ['users', 'plans', 'workout_sessions', 'gyms']:
            cur.execute(f'SELECT count(*) FROM astrok.{t}')
            print(f'  astrok.{t}: {cur.fetchone()[0]}')
"
```

**What we saw on 2026-07-01:**

```
('postgres', 'railway', '18.4 (Debian 18.4-1.pgdg13+1)')
app_tenant: does not exist
astrok schema: ('astrok',)
  astrok.users: 17
  astrok.plans: 5
  astrok.workout_sessions: 1
  astrok.gyms: 1
```

The row counts here matter: `postgres` bypasses RLS, so you see everything.
This is the "before" reading for the smoking-gun test in step 3.

## Step 2 — Apply the migration

The committed migration file has `PASSWORD 'CHANGE_ME_BEFORE_RUNNING'`. Do
**not** commit a real password. Generate a strong one at runtime, substitute
in memory only, then execute:

```powershell
backend\.venv\Scripts\python.exe -c "
import psycopg, secrets
from pathlib import Path

url = 'postgresql://postgres:<POSTGRES_PASSWORD>@viaduct.proxy.rlwy.net:18981/railway'
password = secrets.token_urlsafe(32)  # URL-safe, no percent-encoding needed in DATABASE_URL

sql = Path('database/migrations/007_app_tenant_role.sql').read_text(encoding='utf-8')
sql = sql.replace(\"PASSWORD 'CHANGE_ME_BEFORE_RUNNING'\", f\"PASSWORD '{password}'\", 1)

with psycopg.connect(url, autocommit=True) as con:
    with con.cursor() as cur:
        cur.execute(sql)

print('Migration applied.')
with psycopg.connect(url) as con:
    with con.cursor() as cur:
        cur.execute(\"SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname='app_tenant'\")
        print('role attributes:', cur.fetchone())

print()
print('APP_TENANT PASSWORD (save this — you will need it for DATABASE_URL):')
print(password)
"
```

**What we saw on 2026-07-01:**

```
Migration applied.
role attributes: ('app_tenant', False, False, False, False)

APP_TENANT PASSWORD (save this — you will need it for DATABASE_URL):
<the generated password was captured out-of-band>
```

All four boolean flags must be `False`. If any is `True`, RLS won't enforce
and step 3 will not show the "before/after" gap.

The `token_urlsafe(32)` password uses the URL-safe base64 alphabet
(`A-Z`, `a-z`, `0-9`, `-`, `_`) so it drops into a `DATABASE_URL` verbatim
with no percent-encoding — one less thing to get wrong.

## Step 3 — Prove RLS actually enforces (smoking-gun test)

Connect as `app_tenant` and confirm you see nothing without a gym scope.
This is the whole point of the migration; skip this step and you can't be
sure the fix landed.

```powershell
backend\.venv\Scripts\python.exe -c "
import psycopg
url = 'postgresql://app_tenant:<APP_TENANT_PASSWORD>@viaduct.proxy.rlwy.net:18981/railway?options=-csearch_path%3Dastrok,public'
with psycopg.connect(url) as con:
    with con.cursor() as cur:
        print('Unscoped (expect 0 for tenant tables):')
        for t in ['users', 'plans', 'workout_sessions']:
            cur.execute(f'SELECT count(*) FROM astrok.{t}')
            print(f'  astrok.{t}: {cur.fetchone()[0]}')
        cur.execute('SELECT count(*) FROM astrok.gyms')
        print(f'  astrok.gyms (no RLS): {cur.fetchone()[0]}')
with psycopg.connect(url) as con:
    with con.cursor() as cur:
        cur.execute(\"SET LOCAL app.current_gym_id = '1'\")
        print('With gym scope 1 (expect real counts):')
        for t in ['users', 'plans']:
            cur.execute(f'SELECT count(*) FROM astrok.{t}')
            print(f'  astrok.{t} (gym=1): {cur.fetchone()[0]}')
"
```

**What we saw on 2026-07-01:**

```
Unscoped (expect 0 for tenant tables):
  astrok.users: 0
  astrok.plans: 0
  astrok.workout_sessions: 0
  astrok.gyms (no RLS): 1
With gym scope 1 (expect real counts):
  astrok.users (gym=1): 17
  astrok.plans (gym=1): 5
```

Before the migration, `postgres` (BYPASSRLS) always returned 17 users and 5
plans for the unscoped case — that was the leak. `app_tenant` returns 0
unscoped, real counts scoped. RLS is enforcing.

`astrok.gyms` correctly returns 1 unscoped because it is the tenant registry
itself (no `gym_id` column, no RLS policy). Access is gated at the endpoint
layer via `require_super_admin`. Same story for `password_reset_tokens`.

## Step 4 — Swap Railway's `DATABASE_URL`

1. Railway → your **FastAPI service** (not the Postgres service) → **Variables**.
2. Edit `DATABASE_URL`. Change the username from `postgres` to `app_tenant`
   and the password to the one from step 2. Keep the host (either
   `postgres.railway.internal:5432` for private-network or the public proxy
   host), port, and database name identical.
3. Save. Railway auto-redeploys the service.

Prefer the **internal** hostname (`postgres.railway.internal:5432`) inside
Railway — it's faster and doesn't route through the public proxy.

## Step 5 — Smoke-test the app

Once the redeploy is green:

- Log in as `juand645`, load a client detail page.
- Log a session on any client.
- Promote/demote a gym or create a new one (super_admin flows).

If any endpoint suddenly returns empty data where it shouldn't, an RLS scope
gap has surfaced — the app is missing a `SET LOCAL app.current_gym_id` call
somewhere for that request path. See `backend/app/core/tenancy.py` for how
scope is set. This is exactly what RLS is meant to catch, but it does mean
you need to fix the missing call rather than revert.

## Rollback

If something goes wrong, just flip `DATABASE_URL` back to the `postgres`
credentials and redeploy — the app immediately regains superuser (BYPASSRLS)
behavior and the pre-migration blast radius returns. The role itself stays
and can be dropped later:

```sql
BEGIN;
REASSIGN OWNED BY app_tenant TO postgres;
DROP OWNED BY app_tenant;
DROP ROLE IF EXISTS app_tenant;
COMMIT;
```

The migration is idempotent; re-running it is also a valid recovery for
partial states (e.g. role exists but grants missing).

## Post-rollout follow-ups

- **Rotate `POSTGRES_PASSWORD`.** It was exposed multiple times in chat
  transcripts (see project memory). Railway → Postgres service → Variables
  → regenerate. Any downstream consumer (this app is the only one) needs
  the new `DATABASE_URL`.
- **Rotate the `app_tenant` password every 90 days** by running:
  ```sql
  ALTER ROLE app_tenant WITH PASSWORD 'new-strong-password';
  ```
  Then update Railway's `DATABASE_URL`.
- **Do NOT commit the `app_tenant` password.** The migration file keeps the
  `CHANGE_ME_BEFORE_RUNNING` placeholder for exactly this reason. If a
  future teammate needs the password, they retrieve it from the deployment
  platform (Railway variables), not the repo.
- **Long term: drop `Base.metadata.create_all(bind=engine)` from
  [`backend/app/main.py`](../../backend/app/main.py).** Today it's a no-op
  in prod because the schema is fully migrated (`checkfirst=True`), but if a
  new tenant table is deployed BEFORE the corresponding migration runs, the
  app will fail to boot with "permission denied for schema astrok"
  (`app_tenant` has no CREATE on the schema, by design). The right fix is
  to remove `create_all` from boot and enforce "migrations before deploys."

## Applying the same steps locally

Local dev connects as `gym_admin`, which does not have `CREATEROLE`. To run
this migration locally you need `postgres` (or another superuser) credentials.
Once you have them, the same three commands work — just point them at
`localhost:5432/gym_training` instead of the Railway proxy host. Then update
`backend/.env` `DATABASE_URL` to use `app_tenant` locally so dev exercises
the same RLS path as prod.
