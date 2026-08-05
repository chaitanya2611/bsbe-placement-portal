# Implementation roadmap

## Delivery principles

- Complete one phase, run its actual tests/checks, update documentation, report unresolved risks, and stop.
- Do not claim a control from design or code presence alone; provide test/configuration/operational evidence appropriate to the control.
- Every change references requirement IDs and updates the threat/risk model when trust boundaries or data change.
- Use a modular monolith unless Phase 11 evidence demonstrates a specific need for decomposition.
- Keep deployable increments safe for fictional data until production acceptance gates are met.

## Phases and exit gates

| Phase                            | Scope                                                                                                                                                                                                           | Required exit evidence                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 - Requirements/security design | Requirements, assumptions/scope, architecture, threat/data flow, Mongo model/indexes, API/auth map, state/offline/SEB/deployment designs, roadmap, risks                                                        | Documentation validation passes; departmental/security review remains external; no application code                                              |
| 1 - Foundation                   | pnpm monorepo; React/Vite and NestJS skeletons; shared config/contracts; Mongo replica-set dev Compose; Mailpit; environment validation; liveness/readiness; lint/format/test; CI; seed framework; initial docs | Locked exact versions, Windows/Bash/Docker startup, health integration test, clean lint/typecheck/unit/CI, no secrets/default credentials        |
| 2 - Identity/access              | Admin bootstrap, users/programs, OTP/mail, sessions/rotation/revocation, CSRF/origin, RBAC/permissions, one-session policy, auth audit                                                                          | Real Mongo integration tests for enumeration, expiry/attempt/rate/concurrency, fixation/replay/CSRF and access matrix; step-up proof             |
| 3 - Questions/media              | Versioned discriminated questions, encrypted rubric, all objective types, safe upload/processing, KaTeX/chemical rendering, search/preview/clone/archive                                                        | Serializer leakage tests, crypto rotation/recovery tests, parser/upload/XSS/NoSQL tests, version immutability and media signature tests          |
| 4 - Exam builder/schedule        | Versioned exam/sections/pools/timing/password/randomization settings, validation/publication, notification scheduling                                                                                           | Validation rule tests, version/hash immutability, password rate/hash, scheduling/timezone/state tests, transaction/audit/outbox integration      |
| 5 - Exam engine                  | Authorization/start, fixed CSPRNG selection/order, candidate UI, timers/navigation, revisioned save, IndexedDB queue, lease sync, reload/recovery, auto-submit                                                  | Unit/property/race/integration/E2E tests with real Mongo and controlled clocks; no false saved state; lease deadline negative tests              |
| 6 - Lockdown/integrity           | SEB config/key workflow and request validation; system check/mock; standard-mode telemetry/watermark/deterrents; review UI                                                                                      | Official/cross-tool hash vectors, real proxy/client matrix, altered config negative tests, accessible recovery/exit drill, clear limitation text |
| 7 - Scoring/results              | Objective/numerical scoring, grades, versioned evaluation, attendance, publish policy, student results, PDF marksheet                                                                                           | Golden/property tests for formulas/boundaries, duplicate evaluation races, publication/leakage/access tests, PDF content/visual checks           |
| 8 - Analytics/exports            | Summary/item/section statistics, suppression, CSV/XLSX/PDF/audit exports                                                                                                                                        | Formula reference datasets, zero variance/small-N tests, authorization/audit/private signed download, visual/file validation                     |
| 9 - Notifications                | Durable reminders/changes/cancellation/results/announcements, portal inbox, SMTP abstraction/retry/dedup                                                                                                        | Transactional outbox failure/retry/duplicate tests, Mailpit integration, template injection/privacy checks, backlog observability                |
| 10 - Hardening/security          | ASVS L2 evidence review, ZAP, SAST/SCA/secrets, full authorization/abuse tests, audit/key/upload/session review                                                                                                 | Signed security report, remediated release blockers, explicit risk acceptance by owner, repeatable CI/staging scans                              |
| 11 - Load/reliability            | k6 80-user and burst scenarios, reconnect/submit failures, backup/restore and capacity analysis                                                                                                                 | Versioned scripts/data, exact environment, latency/error/resource results, bottlenecks/remediation, headroom/capacity recommendation             |
| 12 - Deployment/release          | Demo and production delivery, CI/CD, monitoring, backup/restore/rollback, handover/guides/checklists                                                                                                            | Production rehearsal, SEB/system check, restore/rollback, on-call/exam-day drill, approvals and release checklist                                |

## Cross-phase test strategy

### Unit and property tests

Pure domain rules: OTP expiry/limits, permissions, random selection determinism/invariants, numerical tolerance/rounding, scoring/grades, deadlines/sections, lease/conflict/idempotency, and analytics. Inject clock/random/IDs/crypto ports; never weaken production randomness for tests.

### Integration tests

Run against a real MongoDB replica set and real Mongoose schemas/indexes/transactions. Use Mailpit and local S3-compatible storage where applicable. Exercise lifecycle, uniqueness, rollback, outbox/audit, concurrency, and serialization.

### End-to-end tests

Playwright covers student/admin journeys, reload, offline/reconnect, timers, submission, publication, download, and access denial. SEB-specific end-to-end validation additionally requires supported real clients through the real proxy; Playwright cannot substitute for SEB.

### Security tests

Authorization route inventory, ZAP staging baseline, dependency/static/secret/container scans, NoSQL/XSS/CSRF/rate/OTP/session/upload/rubric leakage and cross-user/role tests. Findings have severity, owner, due date, evidence, and acceptance authority.

### Load/reliability tests

k6 models 80 simultaneous candidates plus reasonable headroom, immediate and 30-second saves, start/reconnect/auto-submit bursts, result generation, and admin monitoring. Fault tests cover worker/API restarts, Mongo failover, mail/storage failure, response loss, and clock/readiness behavior.

## Documentation evolution

Phase 1 turns Phase 0 proposals into maintained root documentation and adds exact environment/setup/API/architecture records. Later phases add operator/student/SEB, testing, deployment, backup/restore, incident, retention, limitations, report templates, changelog, contribution and security policy documents. ADRs are superseded rather than rewritten when a decision changes.

## Initial dependency selection criteria (Phase 1)

- Latest stable version supported by the chosen current Node LTS and each official compatibility matrix.
- Maintained, open-source, no silent paid/proprietary service requirement.
- Pin direct dependencies and lock transitive resolution; pin container images/actions with update policy.
- License, security history, release cadence, bundle/runtime footprint, accessibility, Windows and Linux support.
- Create an SBOM and dependency decision record for security-critical libraries (sessions, crypto, validation, sanitization, PDF/scientific rendering).

## Phase report template

Every phase report includes:

1. Completed scope and explicit non-scope.
2. Every created/modified file and affected tree.
3. Exact PowerShell and useful Bash commands.
4. Environment variables and database/migration/index changes.
5. Security controls actually added and their limitations.
6. Tests added, commands actually run, and exact results.
7. Lint/type-check/build/security/load results as applicable.
8. Documentation updates, unresolved risks, decisions, and completion checklist.
9. A stop before the next phase pending `Continue to Phase N`.
