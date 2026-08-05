# Testing guide

## Default suite

```powershell
pnpm test
```

This builds every workspace and runs Node's test runner. Identity and question-bank unit/security coverage is in `tests/identity-security.test.mjs` and `tests/question-bank-security.test.mjs`. Without Docker opt-in, the real-MongoDB lifecycle tests are skipped; the API health test runs with database connection disabled and verifies readiness fails safely.

## Real MongoDB integration

PowerShell:

```powershell
docker compose up -d --wait mongo mongo-init
$env:RUN_DATABASE_INTEGRATION = 'true'
node --test .\tests\api-database.integration.test.mjs
Remove-Item Env:\RUN_DATABASE_INTEGRATION
```

Bash:

```bash
docker compose up -d --wait mongo mongo-init
RUN_DATABASE_INTEGRATION=true node --test ./tests/api-database.integration.test.mjs
```

CI runs this test against the real MongoDB 8.0.28 replica-set container.

## Real identity lifecycle

PowerShell:

```powershell
docker compose up -d --wait mongo mongo-init mailpit
$env:RUN_IDENTITY_INTEGRATION = 'true'
node --test .\tests\identity-auth.integration.test.mjs
Remove-Item Env:\RUN_IDENTITY_INTEGRATION
```

Bash:

```bash
docker compose up -d --wait mongo mongo-init mailpit
RUN_IDENTITY_INTEGRATION=true node --test ./tests/identity-auth.integration.test.mjs
```

The test creates and drops a unique temporary database. It covers CSRF, public enumeration resistance, OTP login, session fixation, student-to-admin denial, concurrent login replacement, revocation, and audit records. CI starts MongoDB and Mailpit before enabling it.

## Real question-bank lifecycle

PowerShell:

```powershell
docker compose up -d --wait mongo mongo-init mailpit
$env:RUN_QUESTION_INTEGRATION = 'true'
node --test .\tests\question-bank.integration.test.mjs
Remove-Item Env:\RUN_QUESTION_INTEGRATION
```

Bash:

```bash
docker compose up -d --wait mongo mongo-init mailpit
RUN_QUESTION_INTEGRATION=true node --test ./tests/question-bank.integration.test.mjs
```

The test creates a unique database and private temporary media root, then removes both. It covers real MongoDB transactions/indexes, authenticated image decode and normalization, safe serializers, encrypted-rubric separation, validation failures, version retention, stale-writer rejection, search, clone, archive, protected rubric reveal, audit persistence, and referenced-media deletion denial. CI enables this test after starting MongoDB and Mailpit.

## Static quality checks

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Linting is type-aware and rejects warnings. Type checking uses strict mode, unchecked-index checks, exact optional properties, unused code checks, and override/return checks.

## Real examination lifecycle

```powershell
docker compose up -d --wait mongo mongo-init mailpit
$env:RUN_EXAM_INTEGRATION = 'true'
node --test .\tests\exam-workflow.integration.test.mjs
Remove-Item Env:\RUN_EXAM_INTEGRATION
```

This creates and removes a unique database and verifies exam publication, authorization, fixed attempts, answer persistence, scoring, unpublished-result privacy, controlled publication, marksheet/attendance files, and analytics. CI runs it with MongoDB and Mailpit.

## Exam-day load profile

Install k6 separately, start a production-like staging environment, and run:

```powershell
$env:PORTAL_API_URL = 'https://staging.example.edu/api/v1'
k6 run .\tests\load\exam-day.k6.js
```

The baseline ramps to 500 virtual users and requires errors below 1%, p95 below 750 ms, and p99 below 1.5 seconds. The final institutional rehearsal must additionally use approved disposable accounts to exercise authorization, autosave, heartbeat, and submission without putting credentials in source.
