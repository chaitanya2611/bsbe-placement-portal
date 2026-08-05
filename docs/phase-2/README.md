# Phase 2 completion report: authentication, users, and authorization

Phase 2 implements the identity boundary and stops before question-bank/media work.

## Completed

- Secure one-time administrator bootstrap with no default credentials.
- Program records plus student full name, institute email, unique roll number, program, and status.
- Exact institute-domain allowlist and pre-provisioned-account login.
- Six-digit CSPRNG email OTPs with keyed storage, expiry, single use, newer-code invalidation, attempt lock, cooldown, and Mongo-backed email/IP windows.
- Opaque server-managed cookie sessions with rotation, idle/absolute expiry, server revocation, logout, account revision invalidation, and one active student session.
- Signed double-submit CSRF tokens plus exact Origin verification on every mutation.
- Global deny-by-default authentication, static role permissions, and recent-OTP checks for sensitive administrator operations.
- Program/account/session/audit administrator APIs and an accessible React OTP/admin interface.
- Append-only identity audit events with pseudonymized IPs and secret-safe metadata.
- Explicit index migration and fictional program seed task.

## API surface

| Method/path                  | Access                                 | Purpose                               |
| ---------------------------- | -------------------------------------- | ------------------------------------- |
| `GET /auth/csrf`             | public                                 | issue signed CSRF pair                |
| `POST /auth/otp/request`     | public + CSRF                          | generic login OTP request             |
| `POST /auth/otp/verify`      | public + CSRF                          | consume OTP and rotate into a session |
| `GET /auth/session`          | authenticated                          | current session/account summary       |
| `POST /auth/logout`          | authenticated + CSRF                   | revoke current device                 |
| `POST /auth/step-up/request` | authenticated + CSRF                   | request fresh sensitive-action OTP    |
| `POST /auth/step-up/verify`  | authenticated + CSRF                   | refresh session authentication time   |
| `/admin/programs`            | administrator                          | list/create and status management     |
| `/admin/users`               | administrator + recent auth for writes | list/create and status management     |
| `/admin/users/:id/sessions`  | administrator                          | list account sessions                 |
| `/admin/sessions/:id/revoke` | administrator + recent auth            | reasoned revocation                   |
| `/admin/audit-events`        | administrator                          | recent identity audit timeline        |

OpenAPI documents every controller route at `/api/docs` when enabled.

## Database change

Migration `002-identity-access-indexes` creates `programs`, `users`, `otpchallenges`, `sessions`, `auditevents`, and `portal_migrations` indexes. See [identity data model](identity-data-model.md). The migration is idempotent and recorded only after index creation succeeds.

## Exact dependency change

- `nodemailer` `9.0.3`
- `@types/nodemailer` `8.0.1` (development only)
- `@bsbe/contracts` workspace link added to the web app

No paid or proprietary dependency was introduced.

## Tests

`tests/identity-security.test.mjs` covers OTP format/state/attempt limits, exact domain matching, RBAC, signed CSRF validation, identity indexes, and production-secret rejection.

`tests/identity-auth.integration.test.mjs` is gated by `RUN_IDENTITY_INTEGRATION=true` and uses a real MongoDB replica set plus Mailpit. It covers CSRF rejection, enumeration-safe responses, OTP login, session fixation, student-to-admin denial, concurrent replacement, old-session rejection, and audit creation. CI enables it after starting the containers.

Latest local result: 17 tests discovered, 15 passed, 0 failed, 2 Docker-gated tests skipped because Docker is unavailable in this environment. Lint and type-check passed after the final correction. A final verification pass is recorded at handoff.

## Security trade-offs and unresolved risks

- Six-digit OTPs have limited entropy; short expiry, request/attempt limits, single use, and server-side locks compensate. Rate-limit calibration still requires the Phase 11 load scenario.
- SMTP delivery is synchronous and not durable. Phase 9 owns queued delivery, retry, and duplicate prevention.
- MongoDB TTL cleanup is asynchronous; expiry checks are performed in every authorization query.
- `SameSite=Lax` is not treated as sufficient CSRF defense; signed double-submit plus exact Origin is mandatory.
- Browser fingerprinting is deliberately absent. Device continuity uses server-generated session/device identifiers, and active-attempt binding arrives with Phase 5.
- The system still cannot host an examination safely: question confidentiality, attempt authorization, timers, autosave, lockdown, scoring, and result access are future phases.

## Phase boundary checklist

- [x] Administrator bootstrap
- [x] Student account and program/roll management
- [x] Institute-domain OTP login
- [x] Secure sessions and CSRF
- [x] RBAC and recent authentication
- [x] Concurrent student-login prevention
- [x] Authentication audit records
- [x] Unit/security and real-database integration tests
- [x] Operations, environment, schema, and ADR documentation
- [x] No Phase 3 question or media implementation

Stop here. Continue only after the user explicitly requests Phase 3.
