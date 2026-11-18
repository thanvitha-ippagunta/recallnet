# RecallNet web application

RecallNet is a supply-chain traceability and product-recall demonstration. MySQL 8 is the source of truth for products, batches, shipments and recalls. MongoDB stores append-only audit events.

## Requirements and setup

- Node.js 20.19 or newer (the MongoDB Node driver requirement)
- MySQL 8.0.16 or newer
- MongoDB server

1. Install MySQL 8 and MongoDB Community Server 8.0. MongoDB must listen on `127.0.0.1:27017`; no MongoDB authentication is configured for this local-only setup.
2. In MySQL, create an empty development database named `recallnet` and a local application user with privileges on that database. From the repository root, initialize a new database in this order: `01_schema.sql`, `02_ddl_demo.sql`, `03_seed_data.sql`, `05_advanced_features.sql`, then `06_auth_rbac_migration.sql`. `04_required_queries.sql` is a report/query demonstration, not a migration. The SQL files are for a fresh development database; never run them against a database containing needed data.
3. Create `web/.env.local` with `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=recallnet`, `MONGODB_URI=mongodb://127.0.0.1:27017`, `MONGODB_DB=recallnet`, and a private random `AUTH_SESSION_SECRET` (at least 32 bytes). Keep this file out of Git.
4. In `web`, install dependencies using `npm ci`. The application creates the documented MongoDB audit indexes idempotently when it first connects.
5. Create the first administrator with `npm run create-admin`; this interactive script prompts for the email and masked password. No default administrator is created.
6. Start with `npm run dev`, then open `http://localhost:3000`. Check `http://localhost:3000/api/health` to confirm both database connections.

## Included application features

- Secure server-side sessions, login/logout, CSRF checks, rate limiting and four roles.
- A shared, responsive operations workspace with route-aware navigation, sign-out feedback, loading states and a retry screen for page failures.
- Batch search, production detail, upstream supplier/material trace and downstream movement timeline.
- Dashboard summary and recall impact views.
- Recall opening through the transactional `sp_open_recall` procedure.
- Draft shipment creation and dispatch through `sp_dispatch_shipment`.
- Shipment listing, draft creation and dispatch workspace at `/shipments`.
- Per-shipment MongoDB audit history from the shipment workspace for roles with audit permission.
- Shipment audit and recall audit records appended to MongoDB after successful MySQL operations.

## Web routes

- `/login` — sign in with an administrator-provisioned account.
- `/` — operations overview with current batch, recall and shipment metrics.
- `/batches` — search batches by batch/product name, filter by status and page through results.
- `/batches/[id]` — view batch details, raw-material suppliers and downstream distribution movements.
- `/recalls` — review recall history and, for authorized roles, open a recall for a completed batch.
- `/recalls/[id]` — inspect affected quantities and distribution movements for a recall.
- `/shipments` — create drafts, dispatch validated shipments and view MongoDB audit events when permitted.

Production batch records are the inventory view in this project; there is no separate inventory CRUD route in the backend. The dashboard and `/batches` page show the batch quantities and statuses maintained in MySQL.

## API routes

- `GET /api/health` — public dependency health, with no connection details.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `GET /api/dashboard/summary`.
- `GET /api/batches`, `GET /api/batches/[id]`, `GET /api/batches/[id]/trace`, `GET /api/batches/[id]/audit-events`.
- `GET /api/recalls`, `POST /api/recalls`, `GET /api/recalls/[id]/impact`.
- `GET /api/shipments`, `POST /api/shipments`, `POST /api/shipments/[id]/dispatch`, `GET /api/shipments/[id]/audit-events`.

All writes use same-origin checks. Shipment dispatch uses the SQL procedure that locks and validates inventory and recall status. Audit-write failures after a committed business action are logged; MongoDB failure does not imply that the MySQL action rolled back.

## Role scope and known limits

- `ADMIN`: all defined permissions.
- `QUALITY_MANAGER`: batch traceability, audit, dashboard and recall management.
- `WAREHOUSE_MANAGER`: batch read and warehouse-origin shipments. There is no warehouse-to-user assignment in the schema, so data is not scoped to one warehouse.
- `DISTRIBUTOR`: movements from/to the linked distributor and downstream dispatch. Accounts must have `distributor_id` set.

The UI focuses on the required demonstration workflows. User provisioning beyond the first ADMIN and warehouse account scoping are not included. The database package documents a fresh-schema demo; it is not a migration framework. Existing databases are preserved: migration setup was applied to the local `recallnet` database only after verifying that all legacy application tables were empty, and a DDL-only snapshot of the prior schema is retained under `database/mysql/archive/`.
