# ADR 0004: Use a conservative bounded offline lease

- Status: Proposed; departmental and security acceptance required before Phase 5
- Date: 2026-08-02

## Context

Temporary network failure should not lose work, but an untrusted browser cannot prove an offline edit occurred before a deadline. Accepting client timestamps after a long outage weakens integrity; rejecting all offline work weakens reliability.

## Decision

Issue a short server-bound lease, initially proposed as two minutes and capped by section/total deadlines. The client may queue while disconnected, but automatic synchronization is accepted only if the request reaches the server before lease/deadline expiry. After expiry the client freezes, pending edits are not silently merged, and controlled reasoned recovery is required.

## Consequences

- Short outages recover transparently with monotonic idempotent operations.
- A long outage can cause legitimate pending work to be excluded, an explicit integrity-over-convenience trade-off.
- Clear UI, resilient infrastructure, system checks, operator staffing, and an appeal/recovery policy are necessary.
- Any relaxation requires a new threat analysis and ADR; client time alone is never sufficient.
