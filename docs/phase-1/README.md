# Phase 1: repository and development foundation

## Outcome

Phase 1 implements the monorepo and development foundation only. It provides buildable web/API shells, shared packages, validated configuration, health/OpenAPI endpoints, development infrastructure, container builds, tests, CI, and setup documentation. It deliberately does not implement Phase 2 identity or later examination features.

## Exact version baseline

Versions were verified on 2026-08-03 and are pinned in package manifests, `pnpm-lock.yaml`, container tags, and CI configuration.

| Component                   |  Pinned version | Selection note                                                                             |
| --------------------------- | --------------: | ------------------------------------------------------------------------------------------ |
| Node.js production/CI image |     24.18.0 LTS | Current Node 24 LTS maintenance release                                                    |
| pnpm                        |          11.9.0 | Workspace package manager                                                                  |
| TypeScript                  |           6.0.3 | Latest stable accepted by typescript-eslint 8.65.0; TypeScript 7.0.2 is intentionally held |
| React / React DOM           |          19.2.8 | Current stable                                                                             |
| React Router                |           8.3.0 | Current stable security-fixed browser router                                               |
| TanStack React Query        |         5.101.4 | Current stable server-state library                                                        |
| Vite                        |           8.2.0 | Current stable                                                                             |
| Vite React plugin           |           6.0.5 | Current stable compatible plugin                                                           |
| NestJS core/common/platform |         11.1.28 | Current stable line                                                                        |
| NestJS Config               |           4.0.4 | Current stable                                                                             |
| NestJS Mongoose             |          11.0.4 | Current stable adapter                                                                     |
| NestJS Swagger              |          11.4.6 | Current stable                                                                             |
| Mongoose                    |          8.24.1 | Latest 8.x supported by NestJS Mongoose 11; Mongoose 9 is intentionally held               |
| MongoDB container           |    8.0.28-noble | Maintained MongoDB 8.0 line with transaction support                                       |
| Mailpit container           |          1.30.0 | Current security release                                                                   |
| ESLint / typescript-eslint  | 10.8.0 / 8.65.0 | Current stable compatible lint stack                                                       |
| Prettier                    |           3.9.6 | Current stable                                                                             |

The local Codex test runtime was Node.js 24.14.0. The declared workspace range accepts it; CI and containers use 24.18.0.

## Implemented modules

### Web

- Accessible React shell and not-found route.
- React Router browser routing.
- TanStack Query provider and API liveness query.
- Neutral configurable BSBE theme and responsive layout.
- Web manifest only; no service worker or authenticated response caching.
- Minimal non-root static production server with security headers and SPA fallback.

### API

- NestJS modular shell under `/api/v1`.
- OpenAPI UI and JSON document.
- Zod-backed environment validation through Nest Config.
- Strict credentialed CORS origin allowlist; wildcard rejected.
- Helmet security headers, global DTO validation, correlation IDs, safe exception envelope, structured JSON logger, and production stack-trace suppression.
- `/health/live` process check and `/health/ready` MongoDB connection check.
- Generic seed runner with unique task IDs, dry-run behavior, and no premature domain seed data.

### Infrastructure and delivery

- MongoDB single-node replica set for development transactions.
- Mailpit development SMTP catcher with pinned security release and bounded message store.
- Optional Compose `application` profile for built web/API images.
- Multi-stage non-root Dockerfiles.
- GitHub Actions formatting, lint, type-check, build/unit/integration, and real MongoDB readiness checks.
- Dependabot configuration for npm, Actions, and Docker.

## Security controls added

- Strict external environment validation and production placeholder rejection.
- No committed `.env` or secrets; only `.env.example` placeholders.
- Exact direct dependency and image tags plus lockfile.
- pnpm lifecycle-script allowlist; the `@scarf/scarf` telemetry postinstall is explicitly denied.
- CORS wildcard rejection, explicit origins, credentials policy, request validation foundation, security headers, opaque correlation IDs, generic 5xx responses, and production trace suppression.
- Readiness fails when MongoDB is disconnected; liveness remains independent.
- Database development topology uses replica-set semantics matching future transactions.
- Containers build in stages and run as the unprivileged `node` user.
- Web service worker is absent to prevent accidental authenticated exam caching.

Authentication, CSRF/session protection, RBAC, rate limiting, audit persistence, application-layer correct-answer encryption, media security, and examination controls are not claimed; they belong to later phases.

## Database changes

No domain collections, schemas, migrations, or indexes were created. The only database work is development topology: MongoDB 8.0.28 runs as replica set `rs0` so later transaction behavior can be tested consistently. The seed runner contains zero domain tasks by design.

## Tests

- Environment defaults, wildcard CORS rejection, and production domain placeholder rejection.
- Correlation ID acceptance/replacement.
- Shared health contract validation.
- Seed runner duplicate-ID rejection and dry-run non-execution.
- HTTP liveness, degraded readiness without a database, response correlation ID, and OpenAPI exposure.
- Opt-in real MongoDB replica-set readiness integration test, run by CI and locally when Docker is available.

## Known limitations and unresolved risks

- Docker Desktop was unavailable in the implementation environment, so the Dockerfiles, Compose topology, and real MongoDB integration test could not be executed locally. CI is configured to run the real Mongo test.
- The initial web bundle is approximately 671 kB minified and triggers Vite's 500 kB chunk warning. Route/vendor splitting should be performed as UI modules are added.
- Development Compose credentials/networking are intentionally local-only and are not production deployment artifacts.
- API rate limiting, CSRF, sessions, RBAC, and security audit storage start in Phase 2.
- Object storage/MinIO is deferred until the Phase 3 media module needs it.
- The institute domain and production providers remain placeholders.

## Phase completion checklist

- [x] pnpm monorepo and separated apps/packages.
- [x] React/Vite shell and NestJS API shell.
- [x] Strict TypeScript, linting, formatting, lockfile.
- [x] MongoDB replica-set and Mailpit Compose services.
- [x] Environment validation and safe placeholder example.
- [x] Liveness, readiness, OpenAPI, and API error foundation.
- [x] Multi-stage non-root Dockerfiles.
- [x] Seed framework without premature domain data.
- [x] Basic CI and dependency update policy.
- [x] Automated foundation and health tests.
- [x] Windows, Docker, environment, architecture, testing, contribution, security, and changelog documentation.
- [ ] Local Docker/real Mongo verification (blocked by missing Docker Desktop; CI configured).
- [ ] External review of institute/provider placeholders.

Stop here. Phase 2 begins only after the explicit instruction `Continue to Phase 2`.
