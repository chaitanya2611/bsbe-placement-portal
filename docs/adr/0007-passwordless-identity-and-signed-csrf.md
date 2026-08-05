# ADR 0007: Passwordless identity and signed double-submit CSRF

- Status: accepted
- Date: 2026-08-03

## Decision

Use administrator-provisioned institute-email accounts, six-digit email OTP challenges, opaque server-managed sessions, and a signed double-submit CSRF token plus exact Origin verification.

OTP and session plaintext values are generated with Node's cryptographic random APIs. MongoDB stores only keyed OTP digests and peppered session-token digests. OTP requests persist dummy challenges for unknown/inactive users where not rate-limited, and public responses stay generic. A partial unique index enforces one active student session.

Authentication is deny-by-default through global guards. Static role permissions gate administrator APIs, while account creation/status changes, program-status changes, and session revocation require a recent OTP-authenticated session.

## Consequences

- A session/OTP/CSRF/IP-key rotation has different invalidation consequences and keys must remain separate.
- Email availability is on the login critical path until Phase 9 adds durable notification processing.
- `SameSite=Lax` is defense in depth, not the CSRF control; state changes still require a signed cookie/header pair and exact Origin.
- An administrator bootstrap is a one-time CLI operation and refuses once any administrator exists.
