# Changelog

All notable changes are documented here. The project is not yet released for production examinations.

## 0.3.0 - 2026-08-03

### Added

- Phase 3 versioned question bank supporting single choice, exact-set multiple select, true/false, numerical tolerances, media, equations, and chemical structures.
- Administrator authoring/preview UI with search, filters, clone, archive/restore, and immutable-version editing.
- Private local/S3-compatible media pipeline, question/rubric/usage schemas, migration 003, and Docker-gated real lifecycle coverage.

### Security

- Correct answers are stored only as separate AES-256-GCM ciphertext bound to a question version; safe serializers exclude rubrics.
- Media is byte/pixel/frame bounded, decoded and normalized to metadata-free WebP, served privately, and protected while referenced.
- Rubric reveal and sensitive mutations require recent authentication and emit append-only audit records.

## 0.2.0 - 2026-08-03

### Added

- Phase 2 institute-domain email OTP login and fresh-OTP administrator step-up flow.
- Opaque server-managed sessions, signed CSRF tokens, exact Origin enforcement, deny-by-default RBAC, and one-active-student-session enforcement.
- Program and user schemas, administrator APIs/UI, activation controls, session revocation, audit records, migrations, secure administrator bootstrap, and fictional program seeds.
- Identity unit/security tests and a Docker-gated real MongoDB lifecycle integration test.

### Security

- OTPs and session tokens are never persisted in plaintext; keyed digests and constant-time comparisons are used.
- Public authentication responses are generic, with per-email/per-IP request windows, cooldown, expiry, attempt locking, older-code invalidation, and atomic consumption.
- Production requires independent cryptographic secrets; identity audit data has no TTL and excludes raw secrets.

## 0.1.0 - 2026-08-03

### Added

- Phase 0 requirements, architecture, threat model, data model, workflows, deployment profiles, roadmap, risks, and ADRs.
- Phase 1 pnpm monorepo with React/Vite, NestJS, and shared TypeScript packages.
- Validated environment configuration, health/readiness, OpenAPI, correlation IDs, security/error/logging foundation.
- MongoDB replica-set and Mailpit development Compose services.
- Multi-stage non-root application Dockerfiles.
- Seed runner, automated tests, GitHub Actions CI, Dependabot, and setup/testing/security documentation.

### Security

- Explicit lifecycle-script allowlist denies the `@scarf/scarf` telemetry postinstall.
- Credentialed CORS rejects wildcard origins.
- No service worker is registered for exam or authenticated data.
- Patched `js-yaml` 5.2.2 is enforced and React Router 8.3.0 avoids the unstable-RSC CSRF advisory affecting 7.12.0 through 8.2.0.
- Phase 1 remains prohibited from real examination use.
