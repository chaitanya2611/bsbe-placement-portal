# Architectural decision records

ADRs capture decisions that shape security, data, or deployment. Accepted records are not rewritten to hide history; a later record supersedes them.

| ADR                                                     | Status                                          | Decision                                                               |
| ------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| [0001](0001-modular-monolith.md)                        | Accepted for implementation                     | Modular monolith with separate API/worker process roles                |
| [0002](0002-server-authority-and-immutable-versions.md) | Accepted for implementation                     | Server authority and immutable published/attempt snapshots             |
| [0003](0003-cookie-sessions.md)                         | Accepted for implementation                     | Revocable opaque cookie sessions instead of browser-held bearer tokens |
| [0004](0004-bounded-offline-lease.md)                   | Proposed; department/security acceptance needed | Conservative bounded offline lease and expired-queue quarantine        |
| [0005](0005-encrypted-rubric-separation.md)             | Accepted for implementation                     | Separate authenticated-encrypted correct-answer/rubric data            |
| [0006](0006-supported-toolchain-versions.md)            | Accepted for Phase 1                            | Pin latest mutually supported TypeScript and Mongoose lines            |
| [0007](0007-passwordless-identity-and-signed-csrf.md)   | Accepted for Phase 2                            | Passwordless OTP identity, opaque sessions, and signed CSRF            |
