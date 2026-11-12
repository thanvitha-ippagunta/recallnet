# RecallNet

**RecallNet is a supply-chain traceability and product-recall management system.** It models the movement of finished products from production batches through distributors to retailers, provides upstream and downstream traceability, and supports controlled product-recall and shipment workflows.

The repository contains a Next.js API application, a MySQL relational database package, and a MongoDB audit-event store. MySQL is the authoritative source for business data; MongoDB stores append-only records describing important actions.

> **Implementation note:** The supplied repository ZIP contains the API routes and server-side application code, but its `web/src/app` page directories and `web/src/components` directory contain only `.gitkeep` placeholders. Do not assume a complete browser-based dashboard/UI is included in this snapshot. The API can be exercised directly with an HTTP client such as Postman or `curl`.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Database setup](#database-setup)
- [Application setup](#application-setup)
- [Run the application](#run-the-application)
- [API reference](#api-reference)
- [Authentication and roles](#authentication-and-roles)
- [Audit event design](#audit-event-design)
- [Database workflows](#database-workflows)
- [Security considerations](#security-considerations)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

## Features

- **Authentication:** administrator bootstrap, login/logout, server-side sessions, password hashing, login rate limiting and role-based authorization.
- **Batch traceability:** retrieve production-batch details and trace raw-material inputs to suppliers.
- **Distribution traceability:** follow shipments from warehouses to distributors and from distributors to retailers, including parent-shipment relationships.
- **Recall management:** open a recall against a production batch and inspect the affected-batch impact.
- **Shipment management:** create draft shipments, list shipments and dispatch eligible shipments.
- **Dashboard data:** retrieve summary information for the dashboard.
- **Audit history:** query audit events associated with production batches and shipments.
- **Database integrity:** relational constraints, views, stored procedures and triggers enforce important business rules.

## Architecture

```text
Client / API consumer (for example, Postman)
                  |
                  v
       Next.js 16 API application
       - Authentication and sessions
       - Role/permission checks
       - Request validation and CSRF checks
       - Batch, shipment, recall and dashboard APIs
             /                 \
            v                   v
       MySQL 8               MongoDB
   System of record       Append-only audit log
   - Products             - Audit events
   - Suppliers            - Actor and entity references
   - Raw-material batches - Event details and timestamps
   - Production batches
   - Shipments
   - Recalls
```

### Why two databases?

- **MySQL** stores structured, relational business data and enforces relationships, quantities, valid shipment routes and transactional business operations.
- **MongoDB** stores event-oriented audit documents. These describe actions that occurred; they are not a second mutable copy of current business records.

For operations such as opening a recall or dispatching a shipment, the business transaction is committed in MySQL first. The application then attempts to append the corresponding MongoDB audit event. If the audit write fails after the MySQL commit, the business operation is not rolled back; the failure is logged. A production deployment should add durable monitoring and retry handling for such failures.

## Technology stack

| Area | Technology | Purpose |
|---|---|---|
| Web/API framework | Next.js 16 (App Router) | Application runtime and HTTP API routes |
| UI/runtime libraries | React 19 | React application foundation |
| Language | TypeScript 5 | Typed application code |
| Relational database | MySQL 8.0.16+ | Transactional supply-chain data |
| Document database | MongoDB | Append-only audit events |
| Database drivers | `mysql2`, `mongodb` | Database connectivity |
| Password security | `argon2` | Argon2id password hashing |
| Code quality | ESLint 9 | Linting |
| Styling dependency | Tailwind CSS 4 | Styling foundation (no completed UI is present in this ZIP) |

## Repository structure

```text
recallnet/
├── database/
│   ├── mongodb/
│   │   ├── README.md
│   │   ├── indexes.js
│   │   ├── aggregation_examples.js
│   │   └── audit_events_example.json
│   └── mysql/
│       ├── 01_schema.sql
│       ├── 02_ddl_demo.sql
│       ├── 03_seed_data.sql
│       ├── 04_required_queries.sql
│       ├── 05_advanced_features.sql
│       ├── 06_auth_rbac_migration.sql
│       ├── README.md
│       └── archive/
├── handover/
├── web/
│   ├── scripts/
│   │   ├── create-admin.mjs
│   │   └── export-audit-events.mjs
│   ├── src/
│   │   ├── app/api/
│   │   │   ├── auth/
│   │   │   ├── batches/
│   │   │   ├── dashboard/
│   │   │   ├── health/
│   │   │   ├── recalls/
│   │   │   └── shipments/
│   │   └── lib/
│   │       ├── auth/
│   │       └── db/
│   ├── .env.example
│   ├── AUTHENTICATION.md
│   ├── package.json
│   └── README.md
├── work/
└── README.md
```

## Prerequisites

Install the following before starting:

- **Node.js 20.19 or newer** (the MongoDB Node.js driver requirement).
- npm (included with Node.js).
- **MySQL Server 8.0.16 or newer**.
- **MongoDB Community Server 8.0** (or a compatible MongoDB deployment).
- Git (optional, for cloning the repository).

The local configuration documented by the project uses MySQL at `127.0.0.1:3306` and MongoDB at `127.0.0.1:27017`.

## Database setup

> **Warning:** The SQL setup scripts are intended for a fresh development database. Do not run them against a database containing data you need to preserve. Back up any existing database before applying schema changes. The archived SQL files are reference snapshots, not the normal setup path.

### 1. Start the database services

Start MySQL and MongoDB. Confirm that both services are listening on their expected local ports.

### 2. Create and initialize the MySQL schema

From the repository root, execute the SQL files in this order using a MySQL 8 client:

```bash
mysql -u root -p < database/mysql/01_schema.sql
mysql -u root -p recallnet < database/mysql/02_ddl_demo.sql
mysql -u root -p recallnet < database/mysql/03_seed_data.sql
mysql -u root -p recallnet < database/mysql/05_advanced_features.sql
mysql -u root -p recallnet < database/mysql/06_auth_rbac_migration.sql
```

The first script creates the `recallnet` database and core tables. The remaining scripts demonstrate DDL, insert sample data, add advanced database objects, and add authentication/RBAC tables.

`04_required_queries.sql` contains query/report demonstrations; it is not a schema migration. Run it when you want to inspect the required queries:

```bash
mysql -u root -p recallnet < database/mysql/04_required_queries.sql
```

The `06_auth_rbac_migration.sql` script creates the authentication tables (`app_users`, `auth_sessions`, and `auth_login_rate_limits`). Apply it once after the core schema. Do not run it again once those tables exist.

For a production installation, create a dedicated MySQL application account with only the privileges the application requires rather than using the MySQL root account.

### 3. Configure MongoDB

Start MongoDB so that it is reachable at `mongodb://127.0.0.1:27017`. The local example configuration does not enable MongoDB authentication; it is intended for local development, not an exposed production database.

The application creates the audit-event indexes when it first connects, as described in the web application documentation. The standalone examples in `database/mongodb/` document the audit-event structure, index definitions and aggregation examples.

## Application setup

### 1. Enter the web application directory

```bash
cd web
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Create the environment file

Copy the example file:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Edit `web/.env.local` and set the values for your local databases:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_mysql_application_user
DB_PASSWORD=your_mysql_password
DB_NAME=recallnet

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=recallnet

AUTH_SESSION_SECRET=replace_with_at_least_32_random_bytes
```

Generate a cryptographically random session secret with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `AUTH_SESSION_SECRET`. Keep `.env.local` private and never commit it. The committed `.env.example` contains placeholders only.

### 4. Create the first administrator

After the MySQL authentication migration has been applied and the environment variables are configured, run:

```bash
npm run create-admin
```

The interactive script prompts for the administrator email and password. Password input is masked, and the password is stored as an Argon2id hash. The script does not create a default account and refuses to bootstrap another administrator if one already exists.

See [`web/AUTHENTICATION.md`](web/AUTHENTICATION.md) for more detail about sessions, CSRF protection, rate limiting and role scope.

## Run the application

From the `web/` directory:

```bash
npm run dev
```

The Next.js server starts at:

```text
http://localhost:3000
```

Check database connectivity using:

```text
http://localhost:3000/api/health
```

The health endpoint reports dependency health without exposing database connection details.

Other available scripts:

```bash
npm run lint       # Run ESLint
npm run build      # Create a production build
npm run start      # Start the production server (after a successful build)
npm run create-admin  # Bootstrap the first administrator
```

## API reference

All routes are served from `http://localhost:3000`. Protected endpoints require a valid authenticated session. The exact request body and response shape should be checked in the corresponding `route.ts` implementation.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Check application/database dependency health |
| `POST` | `/api/auth/login` | Authenticate a user and establish a session |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/me` | Return the current authenticated user |
| `GET` | `/api/dashboard/summary` | Retrieve dashboard summary data |
| `GET` | `/api/batches` | List/search production batches |
| `GET` | `/api/batches/{id}` | Retrieve a production batch |
| `GET` | `/api/batches/{id}/trace` | Retrieve upstream/downstream batch trace information |
| `GET` | `/api/batches/{id}/audit-events` | Retrieve audit history for a production batch |
| `GET` | `/api/recalls` | List recalls (supports status filtering and pagination) |
| `POST` | `/api/recalls` | Open a recall for a production batch |
| `GET` | `/api/recalls/{id}/impact` | Retrieve the impact of a recall |
| `GET` | `/api/shipments` | List shipments |
| `POST` | `/api/shipments` | Create a draft shipment |
| `POST` | `/api/shipments/{id}/dispatch` | Dispatch a draft shipment after database validation |
| `GET` | `/api/shipments/{id}/audit-events` | Retrieve audit history for a shipment |

### Example health check

```bash
curl http://localhost:3000/api/health
```

### Example authenticated workflow

1. Send a same-origin `POST` request to `/api/auth/login` with the login payload expected by the route implementation.
2. Preserve the session cookie returned by the server.
3. Use that cookie when calling protected GET endpoints.
4. For state-changing POST requests, send the matching `Origin` header and satisfy the application's same-origin/Fetch Metadata checks.
5. Use the API response to verify the result. For shipment dispatch and recall creation, inspect the associated audit history where permitted.

The login route and API handlers validate request content and permissions. Refer to the route source files for exact JSON fields; do not assume that illustrative payloads from another version of the project are compatible.

## Authentication and roles

The application defines four roles:

| Role | Intended responsibility / documented scope |
|---|---|
| `ADMIN` | Full access to the currently defined application permissions |
| `QUALITY_MANAGER` | Batch traceability, audit access, dashboard and recall management |
| `WAREHOUSE_MANAGER` | Batch listing/details; warehouse-specific shipment creation is not enabled in the current implementation |
| `DISTRIBUTOR` | Distributor-linked downstream shipment operations; account must have a linked `distributor_id` |

Authorization is enforced on the server. Hiding an action in a client interface is not a substitute for API permission checks. The precise permissions for each route are implemented in `web/src/lib/auth/roles.ts` and the individual route handlers.

Authentication security includes:

- Argon2id password hashing.
- Random session tokens stored as SHA-256 hashes in MySQL.
- HttpOnly, SameSite=Lax session cookies; Secure cookies in production.
- Eight-hour session expiry and server-side logout revocation.
- Login rate limiting (five failed attempts per 15-minute window per keyed email/IP pair).
- Same-origin and Fetch Metadata checks for login/logout and other state-changing routes.

## Audit event design

MongoDB stores documents in the `audit_events` collection. An event includes:

- `eventType` — the kind of action (for example, `RECALL_OPENED` or `SHIPMENT_DISPATCHED`).
- `occurredAt` — UTC BSON date.
- `actor` — user ID and role responsible for the action.
- `entity` — entity type and corresponding MySQL numeric ID.
- `references` — optional related MySQL identifiers.
- `details` — an immutable snapshot describing the action.
- `requestId` — request correlation identifier.

The documented event types include `RECALL_OPENED`, `RECALL_STATUS_CHANGED`, `SHIPMENT_CREATED`, `SHIPMENT_DISPATCHED`, `SHIPMENT_BLOCKED`, `BATCH_STATUS_CHANGED`, and `RECOVERY_RECORDED`. The MongoDB package README and example JSON document the event contract.

Audit events are append-only by design. They describe what happened at a point in time and should not be edited to represent current business state.

## Database workflows

The MySQL package contains the core relational schema and advanced database objects, including views, stored procedures and triggers.

Important stored procedures include:

- `sp_trace_batch` — supports production-batch traceability.
- `sp_open_recall` — opens a recall transactionally, records the affected batch and updates batch status.
- `sp_dispatch_shipment` — validates and dispatches a shipment transactionally, including inventory and recall checks.

The shipment dispatch procedure locks and validates relevant inventory before dispatch. The database triggers also guard shipment and shipment-item operations. The SQL package README documents a sample two-stage shipment flow and a recall/blocking test scenario. Follow that document when demonstrating the database workflow; do not rerun the seed script after you have begun dispatch or recall testing because it resets sample movement rows.

## Security considerations

- Never commit `.env.local`, database passwords, session secrets or real user credentials.
- Do not expose the local MongoDB configuration without enabling authentication and network restrictions.
- Use a dedicated least-privilege database account for the application.
- Use HTTPS and secure cookie settings in production.
- Configure the reverse proxy to replace (not append untrusted values to) forwarded client-IP headers, as described in `web/AUTHENTICATION.md`.
- Back up the MySQL database before applying schema changes.
- Treat audit-write failures as operational incidents requiring monitoring/retry handling; a committed MySQL action is not undone by a later MongoDB audit failure.

## Known limitations

- This ZIP snapshot contains API routes and backend logic but no completed Next.js page components or reusable UI components; a finished browser dashboard is therefore not included in this snapshot.
- Warehouse-user-to-warehouse assignment is not represented in the schema, so warehouse access is not scoped to an individual warehouse account.
- Warehouse-manager shipment creation is explicitly blocked pending warehouse-specific write permissions.
- Distributor accounts need a linked `distributor_id`; access must remain scoped to that distributor's downstream operations.
- User provisioning beyond the initial administrator is not covered by the documented bootstrap workflow.
- The SQL scripts are a fresh-development-schema setup, not a general-purpose migration framework.
- MongoDB audit insertion occurs after the MySQL business transaction commits. Durable retry/monitoring infrastructure is a production-hardening task.

## Troubleshooting

### `/api/health` reports a database as unavailable

- Confirm the relevant database service is running.
- Verify the host, port, username, password and database name in `web/.env.local`.
- Confirm that the MySQL user has privileges on `recallnet`.
- Confirm MongoDB is reachable at the configured URI.
- Restart the Next.js development server after changing environment variables.

### Login does not work

- Confirm `06_auth_rbac_migration.sql` was applied once to the correct database.
- Confirm an administrator was created using `npm run create-admin`.
- Confirm `AUTH_SESSION_SECRET` is configured and contains at least 32 random bytes.
- Check that the request satisfies the same-origin requirements.

### Shipment dispatch is rejected

- Confirm the shipment is in `DRAFT` status.
- Confirm the source has sufficient available quantity.
- Confirm the production batch is not recalled or otherwise blocked.
- For distributor-to-retailer movements, verify the required parent shipment and route relationship.
- Review the MySQL stored procedure and trigger messages, then inspect the shipment and batch records.

### SQL setup reports that a table already exists

The scripts are not designed to be blindly re-run on an initialized database. Verify which setup steps have already completed and do not drop tables or rerun seed data if existing data must be preserved.

## Additional documentation

- [Web application setup and feature notes](web/README.md)
- [Authentication setup and security details](web/AUTHENTICATION.md)
- [MySQL schema and workflow guide](database/mysql/README.md)
- [MongoDB audit-event guide](database/mongodb/README.md)

---

**RecallNet** — trace products, understand their movement, and manage recalls with relational integrity and an auditable event history.
