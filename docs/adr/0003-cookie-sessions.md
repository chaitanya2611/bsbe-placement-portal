# ADR 0003: Use revocable opaque server-side cookie sessions

- Status: Accepted for implementation
- Date: 2026-08-02

## Context

The browser must not hold long-lived bearer credentials readable by JavaScript. The system needs immediate logout/admin revocation, one-student-session enforcement, active-attempt device binding, rotation, expiry, and recent-authentication checks.

## Decision

Use high-entropy opaque session tokens in narrow `HttpOnly` cookies (`Secure` in production, appropriate `SameSite`). Persist only a token hash plus server session state. Rotate at authentication and privilege/security transitions. Protect state-changing routes with CSRF tokens plus Origin/Fetch Metadata checks. Enforce concurrency through transactional server state/security revisions.

## Consequences

- CSRF is an explicit threat and test obligation.
- Database/session availability affects authentication, but revocation/concurrency are dependable.
- Session tokens, CSRF secrets, and identifiers require distinct handling/redaction.
- Device transfer is an explicit audited server workflow rather than fingerprint trust.
