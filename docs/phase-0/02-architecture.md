# Architecture proposal

## Architectural style

Use a **modular monolith** with a React browser application, one NestJS API/worker codebase separated into deployable process roles, MongoDB, private object storage, and email infrastructure. This keeps authorization and transactions coherent for the initial load while preserving internal module boundaries.

No load evidence justifies microservices. Background jobs may run in a separate process/container built from the same codebase, but they share contracts and versioning and are not an independently owned service.

## Logical components

| Component                      | Responsibility                                                                                                          | Must not do                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Student/Admin web app          | Accessible routes, local UI state, query cache, exam queue, status indicators, SEB/system checks                        | Decide authorization, deadlines, final save acceptance, scoring, or result visibility |
| API edge and common middleware | TLS-forwarding trust, correlation ID, request limits, headers, CORS/origin, CSRF, session lookup, generic error mapping | Trust arbitrary forwarding headers or leak exception details                          |
| Identity module                | Users, OTP, sessions, step-up, revocation, concurrency policy                                                           | Store OTP/session tokens in cleartext or reveal account existence                     |
| Exam authoring module          | Drafts, sections, pools, validation, publication/versioning                                                             | Mutate a published version                                                            |
| Question/media module          | Versioned content, encrypted rubrics, safe media metadata/access                                                        | Serialize rubrics through student DTOs or serve raw unsafe uploads                    |
| Attempt engine                 | Authorization, fixed randomization, timers, section transitions, lease/recovery, device binding                         | Trust client clock/order/attempt ownership                                            |
| Answer/submission module       | Revisioned idempotent saves, sync, finalization                                                                         | Accept post-deadline or stale-device writes                                           |
| Evaluation/results module      | Server scoring, versioned results, publication and marksheets                                                           | Expose unpublished results/correct answers                                            |
| Attendance/analytics/export    | Derived status, statistics, authorized exports                                                                          | Treat telemetry alone as proof of cheating                                            |
| Notification worker            | Transactional outbox consumption, template render, retries/deduplication                                                | Send inside an academic transaction or log secrets/content unnecessarily              |
| Audit module                   | Append-only security/academic records and queries                                                                       | Accept update/delete through application APIs                                         |
| MongoDB                        | Canonical operational/academic data, transactions, indexes                                                              | Rely on TTL for retained academic records                                             |
| Object storage                 | Private original/derived media and reports using short-lived signed access                                              | Expose public buckets by default                                                      |

## Layering inside each backend module

```text
HTTP controller / serializer
        -> application use case + authorization policy
            -> domain model / pure rules
                -> repository, crypto, clock, random, mail, storage ports
                    -> Mongoose and provider adapters
```

- Controllers handle protocol mapping, not business rules.
- DTOs validate shape and constraints at the boundary; repositories also enforce ownership filters and schema invariants.
- Student and administrator read models are different types and queries. Avoid “load everything then omit answer” patterns.
- Clock, random source, ID source, encryption, storage, email, and audit are injected ports so domain tests are deterministic.
- Commands that change academic state carry actor, reason where required, correlation ID, and idempotency key.

## Security boundaries

1. **Untrusted endpoint**: browser, IndexedDB, service worker, clocks, headers not cryptographically tied to SEB, and all request bodies.
2. **Trusted edge**: managed reverse proxy/load balancer. Only its addresses may supply forwarded scheme/host/IP.
3. **Application trust zone**: API and worker identities with least-privilege secrets. Admin permissions remain explicit inside this zone.
4. **Data trust zone**: MongoDB replica set, object store, backups, and key management on private networks/allowlists.
5. **External delivery zone**: SMTP/provider; messages contain minimal non-sensitive information and links back to the portal.

SEB increases endpoint control but does not make the device or HTTP input inherently trusted. Request-hash validation proves compatibility with an allowed SEB executable/configuration to the limits of SEB's documented mechanism; normal session, CSRF, authorization, and attempt controls still apply.

## Critical consistency decisions

### Attempt start

Within a MongoDB transaction (or transaction plus deterministic retry), verify the exam version and schedule, ensure no active conflicting session/attempt, create the attempt, materialize immutable question instances/order, bind the device session, record audit/outbox, and return the already-created attempt on idempotent replay.

### Answer save

Use a conditional atomic update keyed by `attemptId + questionInstanceId`, expected attempt revision/device session, and monotonic client sequence. Record the server receipt time. Return the canonical answer revision. Duplicate idempotency keys return the original response; lower/equal sequences cannot overwrite newer state.

### Submission

One conditional transition acquires finalization (`IN_PROGRESS|PAUSED_INTEGRITY -> FINALIZING`) when the actor and deadline rules allow. It records the final accepted answer-set revision, then creates evaluation/result and outbox/audit records exactly once. Retries return the terminal representation. A recovery worker can complete a stranded `FINALIZING` transaction safely.

### Publication and notification

Academic changes and an outbox record commit together. Workers claim messages with leases and unique deduplication keys. Provider success/failure is stored without placing mail credentials or sensitive payloads in general logs.

## Correct-answer separation

- `questionVersions.content` contains candidate-safe prompt/options/media references.
- `questionVersions.rubricCiphertext` contains authenticated-encrypted answer/evaluation data with `keyId`, nonce, tag/ciphertext, and associated data binding question/version IDs.
- Only authoring validation, privileged review, and server evaluation services can invoke the decrypt port.
- Encryption keys live in `<cloud-provider>` secret/KMS facilities or an equivalent managed secret system, never MongoDB or source. Envelope encryption and a key-version registry permit rotation.
- Rotation re-wraps/re-encrypts through a resumable audited job while old keys remain recoverable until all ciphertext and backups age out.

## Browser storage and caching

- TanStack Query is the proposed server-state library; final maintained version is selected in Phase 1.
- IndexedDB stores only attempt-scoped pending answer operations, opaque IDs, client sequence, and lease reference. Do not store correct answers, OTPs, session cookies, full admin data, or unrestricted exam exports.
- Browser persistence is cleared on acknowledged submission/logout where safe, and orphan queues expire locally. Server state wins on recovery according to the sync protocol.
- `Cache-Control: no-store` applies to authentication, exam, attempt, answer, admin, and result responses. The service worker does not intercept these paths.

## Observability

- Structured JSON logs with correlation/request ID; field allowlist and central redaction.
- Metrics: request latency/error/rejection, active attempts, save lag, revision conflicts, offline leases, auto-submit backlog, outbox age/retries, mail failure, Mongo pool/transaction health, object errors, rate limiting, audit failures, and clock skew.
- Audit events are distinct from operational logs. Health is liveness only; readiness fails when the API cannot safely serve its role.
- Alerts prioritize missed/late saves, clock drift, database durability, finalization backlog, audit write failure, storage/certificate expiry, and backup/restore status.

## Technology choices deferred to Phase 1 pinning

Exact supported versions of Node.js, TypeScript, pnpm, React, Vite, NestJS, MongoDB, Mongoose, the query library, KaTeX, chemical renderer, test tools, and container bases will be verified against official compatibility matrices, pinned in manifests/lockfiles/images, and recorded in an environment reference. Phase 0 specifies capabilities without pretending an untested version combination is approved.

## Major decisions

The formal records are indexed in [the ADR directory](../adr/README.md): modular monolith, server authority and immutable snapshots, revocable cookie sessions, bounded offline leases, and separate encrypted rubric storage.
