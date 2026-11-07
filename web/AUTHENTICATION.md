# RecallNet authentication setup

## Apply the MySQL migration

Back up the RecallNet database first. Apply `../database/mysql/06_auth_rbac_migration.sql` once, after the core schema. It creates only `app_users`, `auth_sessions`, and `auth_login_rate_limits`; it does not change existing business tables or records. Do not re-run it after the tables exist.

From a PowerShell terminal in `web`, with the configured MySQL client available, the migration can be applied with (adjust the relative path only if the folder structure differs):

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u YOUR_MYSQL_ADMIN_USER -p recallnet -e "source ../database/mysql/06_auth_rbac_migration.sql"
```

The client prompts for the MySQL password; do not put it in the command line.

## Configure a session secret

Set `AUTH_SESSION_SECRET` in the local `web/.env.local` file. Generate a value locally with Node's cryptographic random generator, then paste it into that file without sharing it:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use at least 32 random bytes. `.env.local` is ignored; the committed `.env.example` contains only a placeholder.

## Create the first ADMIN

After applying the migration and setting the environment variables, run this in an interactive terminal:

```powershell
npm run create-admin
```

The script prompts for the account email and reads the password without echoing it (masked input), then asks for confirmation. It stores only an Argon2id hash. The bootstrap command refuses to create an account if an ADMIN already exists; it has no default password and no public registration endpoint.

## Session and CSRF behavior

Sessions use a 256-bit random token in an HttpOnly, SameSite=Lax cookie. MySQL stores only the SHA-256 token hash; sessions expire after eight hours and logout revokes the server-side row. Cookies add Secure in production. Login attempts are limited to five failures per 15-minute window per HMAC-keyed email/IP pair. Configure the production reverse proxy to replace, not append untrusted values to, `X-Forwarded-For`/`X-Real-IP`.

Login and logout POST requests require a matching `Origin` and reject cross-site Fetch Metadata. Keep this check on every future cookie-authenticated state-changing route. GET routes use server-side permission checks and never trust frontend visibility.

## Current access scope

The existing GET APIs are protected as follows:

| Role | Current GET access |
|---|---|
| ADMIN | All current business GET APIs |
| QUALITY_MANAGER | Batches, traceability, audit history, recalls, dashboard |
| WAREHOUSE_MANAGER | Batch listing and details |
| DISTRIBUTOR | No current business GET route; auth/session routes only |

The schema has no shipment GET endpoint. `app_users.distributor_id` references the existing `distributors.distributor_id` so a future assigned-shipment route can scope results. Add that route before granting distributors shipment access. No warehouse-user relationship exists, so warehouse access is currently limited to batch list/detail and is not scoped to a warehouse account.

Auth routes: `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`. `/api/health` remains public. The auth migration has not been applied automatically by the application.
