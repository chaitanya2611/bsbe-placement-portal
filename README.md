# BSBE Placement Mock Test Portal

Secure, provider-neutral departmental placement mock-test portal. Phases 0–12 are implemented in the application and release assets; production activation still requires institution-owned infrastructure, secrets, domain/TLS, SMTP, object storage, and a signed release rehearsal.

## Current capabilities

- pnpm monorepo with React/Vite web, NestJS REST API, and shared contracts/config/utilities.
- Strict TypeScript, typed ESLint rules, Prettier, frozen lockfile, and GitHub Actions CI.
- Versioned `/api/v1` endpoints, OpenAPI, environment validation, correlation IDs, safe error responses, structured logs, security headers, and credentialed CORS allowlisting.
- Separate liveness and MongoDB-backed readiness endpoints.
- Docker Compose development infrastructure with a single-node MongoDB replica set and Mailpit.
- Multi-stage, non-root API and web container images.
- Passwordless institute-email OTP authentication with enumeration-safe responses, expiry, single use, attempt limits, request limits, and SMTP delivery.
- Opaque server-managed cookie sessions, signed double-submit CSRF defense, exact Origin checks, deny-by-default RBAC, recent-authentication checks, and one active student session.
- Secure one-time administrator bootstrap, administrator program/account management, account activation controls, session revocation, and append-only authentication audit events.
- Accessible OTP login and role-specific student/administrator portal UI. No service worker caches authenticated data.
- Immutable, versioned single-choice, exact-set multiple-select, true/false, and numerical questions with search, filters, clone, archive, preview, and history.
- Separately encrypted AES-GCM rubrics, private normalized image media, safe KaTeX equation preview, and validated/sanitized chemical structure rendering.
- Fictional M.Tech., M.Sc., and Ph.D. reference-data seed task.
- Immutable scheduled examinations with timed sections, fixed randomized attempts, server-authoritative timers, autosave/offline recovery, Safe Exam Browser validation, automatic scoring, controlled results, analytics, exports, and durable notifications.
- Release/security workflows, a 500-user load profile, production reverse-proxy example, backup/restore scripts, exam-day operations, rollback, and acceptance documentation.

Start with the [Phase 4–12 guide](docs/phases-4-12.md), [operations guide](docs/operations-guide.md), [release checklist](docs/release-readiness.md), [Safe Exam Browser guide](docs/safe-exam-browser.md), or [Windows setup](docs/setup-windows.md).

## Requirements

- Node.js 24 LTS (`24.18.0` production target; `>=24.14.0 <25` accepted by the workspace)
- pnpm `11.9.0`
- Docker Desktop with Compose v2 for MongoDB and Mailpit
- PowerShell 5.1+ on Windows, or a POSIX-compatible shell

## Quick start on Windows

For an already initialized workstation, start live development with one command:

```powershell
Set-Location 'C:\Users\Admin\Documents\Exam Portal'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-development.ps1
```

On a fresh database, create the one-time administrator before using the sign-in page:

```powershell
pnpm bootstrap:admin -- --email walvekarchaitanya@gmail.com --name "Initial Administrator"
```

Then open:

- Web: `http://localhost:5173`
- API metadata: `http://localhost:3000/api/v1`
- API liveness: `http://localhost:3000/api/v1/health/live`
- API readiness: `http://localhost:3000/api/v1/health/ready`
- OpenAPI UI: `http://localhost:3000/api/docs`
- Mailpit: `http://localhost:8025`

## Quick start with Bash

```bash
cd '/path/to/Exam Portal'
cp .env.example .env
pnpm install --frozen-lockfile
bash ./scripts/start-infrastructure.sh
pnpm migrate
pnpm seed -- --apply
pnpm bootstrap:admin -- --email walvekarchaitanya@gmail.com --name 'Initial Administrator'
pnpm dev
```

## Quality commands

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm seed
pnpm validate:phase3
pnpm validate:release
```

Real MongoDB readiness integration test:

```powershell
docker compose up -d --wait mongo mongo-init
$env:RUN_DATABASE_INTEGRATION = 'true'
node --test .\tests\api-database.integration.test.mjs
Remove-Item Env:\RUN_DATABASE_INTEGRATION
```

The identity lifecycle test additionally requires Mailpit:

```powershell
docker compose up -d --wait mongo mongo-init mailpit
$env:RUN_IDENTITY_INTEGRATION = 'true'
node --test .\tests\identity-auth.integration.test.mjs
Remove-Item Env:\RUN_IDENTITY_INTEGRATION
```

The question-bank lifecycle test uses MongoDB, Mailpit, and private temporary media storage:

```powershell
docker compose up -d --wait mongo mongo-init mailpit
$env:RUN_QUESTION_INTEGRATION = 'true'
node --test .\tests\question-bank.integration.test.mjs
Remove-Item Env:\RUN_QUESTION_INTEGRATION
```

## Repository structure

```text
apps/
|-- api/                  NestJS API, identity, question bank, private media and migrations
`-- web/                  React/Vite authentication and assessment administration UI
packages/
|-- config/               Runtime environment schemas
|-- contracts/            Shared API schemas/types
`-- shared/               Framework-independent utilities
docs/
|-- phase-0/              Approved design baseline
|-- phase-1/              Foundation implementation report
|-- phase-2/              Identity/access implementation and operations
|-- phase-3/              Question-bank/media implementation and data model
`-- adr/                  Architectural decision records
infra/mongodb/            Replica-set initialization
scripts/                  Windows and Bash setup/validation helpers
tests/                    Foundation and integration tests
.github/workflows/        CI
docker-compose.yml        Development infrastructure and optional app profile
```

## Safety status

The software workflow is complete, but it is not approved for a real placement examination until every mandatory item in the [release checklist](docs/release-readiness.md) is complete. Institution-owned SMTP/S3/database/TLS/monitoring secrets, a production restore and rollback drill, authenticated capacity rehearsal, accessibility/SEB device tests, and responsible-owner sign-off remain external release prerequisites.
