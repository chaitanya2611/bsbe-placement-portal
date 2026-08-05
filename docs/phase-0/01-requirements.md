# Requirements specification

## Purpose and success criteria

The BSBE Placement Mock Test Portal must safely conduct objective placement mock examinations for about 80 simultaneous candidates. A release is successful only when it preserves authorized identity, delivers a reproducible exam, accepts each answer exactly according to server time and revision rules, submits once, evaluates only on the server, restricts result disclosure, and leaves a reviewable audit trail.

Requirements use these priorities:

- **P0**: required for a real examination; release blocker.
- **P1**: required for initial operational completeness.
- **P2**: valuable enhancement that may follow the first controlled release.

## Actors

- **Student**: pre-provisioned candidate in M.Tech., M.Sc., or Ph.D.
- **Administrator**: authorized departmental operator. Phase 2 should separate permissions internally (user manager, exam author, exam operator, result publisher, auditor) even if the UI initially calls them all administrators.
- **Support operator**: an administrator exercising exam-day recovery privileges with mandatory reason.
- **System services**: mail worker, scheduler, object storage, database, audit sink, and backup jobs.

## Functional requirements

### Identity, authentication, and sessions

| ID      | Priority | Requirement / acceptance boundary                                                                                                                                                                                        |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUTH-01 | P0       | Only an active, pre-existing account with a normalized email ending in exactly `@<replace-with-real-domain>` may request an OTP. Public responses and comparable timing must not reveal account existence.               |
| AUTH-02 | P0       | OTPs use a CSPRNG, are hashed with a slow keyed/password-safe construction plus server pepper, expire quickly, are single-use, have bounded verification attempts, and invalidate predecessors. Values never enter logs. |
| AUTH-03 | P0       | Request and verify endpoints are independently rate-limited by normalized account key, IP/network signal, and global safety limits, with cooldown and temporary lockout.                                                 |
| AUTH-04 | P0       | Successful verification rotates the session identifier and creates a server-side revocable session represented only by an opaque `HttpOnly` cookie (`Secure` in production, narrow path/domain, appropriate `SameSite`). |
| AUTH-05 | P0       | State-changing cookie-authenticated requests require CSRF protection plus strict CORS/origin checks. Login CSRF is included.                                                                                             |
| AUTH-06 | P0       | A student has at most one active authenticated session. A second login is denied during an active exam. Outside an exam the configured policy is explicit and audited.                                                   |
| AUTH-07 | P0       | Admin-sensitive actions require a recent session or fresh OTP step-up; account/session/attempt overrides require reason and audit.                                                                                       |

### User and program administration

| ID      | Priority | Requirement / acceptance boundary                                                                                                                           |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| USER-01 | P0       | Admins create, update, activate, and deactivate users with unique normalized institute email and roll number, full name, program, and status.               |
| USER-02 | P0       | A secure CLI bootstrap creates the first admin from explicit input; source and seeds contain no real/default credential.                                    |
| USER-03 | P1       | Bulk import validates every row, provides a dry run, rejects ambiguous duplicates, and audits the accepted operation without exposing sensitive row bodies. |

### Question bank and media

| ID       | Priority | Requirement / acceptance boundary                                                                                                                                                                |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QB-01    | P0       | Support single-choice, exact-set multiple-select, true/false, numerical, and media-supported objective questions.                                                                                |
| QB-02    | P0       | Correct-answer/rubric data is encrypted separately and never appears in student exam serializers, caches, logs, analytics events, or client bundles.                                             |
| QB-03    | P0       | Editing a version referenced by a published/completed exam creates a new immutable version. Attempts retain sufficient snapshots for exact reproduction.                                         |
| QB-04    | P1       | Search/filter/preview/clone/archive/tag/difficulty/usage history are supported with authorization and pagination.                                                                                |
| MEDIA-01 | P0       | Uploads use allowlisted signatures and types, byte/pixel/complexity limits, generated names, private storage, metadata stripping where practical, and no executable or unsanitized SVG delivery. |
| MEDIA-02 | P1       | KaTeX renders a safe supported subset. Chemical structures use maintained open-source rendering from validated SMILES/MOL/SDF without executing embedded scripts.                                |

### Exam authoring and scheduling

| ID      | Priority | Requirement / acceptance boundary                                                                                                                                                                                                                                      |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXAM-01 | P0       | Exams include identity, instructions, eligible programs, UTC schedule with IANA timezone, entry window, total/section timing, access-password policy, lockdown/fallback policy, randomization, attendance, result publication, grade settings, and version provenance. |
| EXAM-02 | P0       | Publication is blocked until validation finds no empty/invalid pool, missing answer, invalid tolerance/marks, duplicate option ID, timing conflict, broken media, schedule error, or missing required password.                                                        |
| EXAM-03 | P0       | Publishing freezes an immutable exam version. Changes affecting candidates require a new version, explicit rescheduling/notification policy, and audit.                                                                                                                |
| EXAM-04 | P0       | Exam passwords are stored using an adaptive password hash, never retrievable or logged, and independently rate-limited.                                                                                                                                                |

### Attempts, timing, and answers

| ID       | Priority | Requirement / acceptance boundary                                                                                                                                                                                                                                      |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATT-01   | P0       | Start authorization validates identity, eligibility, schedule, password, attempt limit, session/device binding, and required SEB evidence in one idempotent server flow.                                                                                               |
| ATT-02   | P0       | The server generates a cryptographically random seed, selects questions/options, persists the immutable order/snapshots, and never re-randomizes an attempt.                                                                                                           |
| TIMER-01 | P0       | Start/end/section deadlines are server instants. Reload, reconnect, client clock changes, and session rotation do not extend them. API responses provide server time and deadline.                                                                                     |
| ANS-01   | P0       | Answer save is idempotent and monotonic by attempt, question instance, device session, client sequence, expected revision, and idempotency key. A response says `saved` only after durable acknowledgement.                                                            |
| ANS-02   | P0       | The browser attempts immediate save on answer change/navigation/section change/hide/close/reconnect/submit and periodic save at 30 seconds. IndexedDB holds only a minimal encrypted-at-rest-by-platform/opaque temporary queue; logout/submission cleanup is defined. |
| OFF-01   | P0       | Disconnected work is bounded by a signed/opaque server lease. Reconnection after lease expiry cannot establish when client edits happened; pending edits are quarantined/rejected and normal input stops.                                                              |
| SUB-01   | P0       | Student, timer, section, and admin submission/termination paths converge on one idempotent transaction/state transition selecting the final durable answer revision once.                                                                                              |
| REC-01   | P0       | Reload/crash recovery on the authorized device restores server answers/order/deadlines and then reconciles eligible local operations; another device is rejected absent audited transfer.                                                                              |

### Lockdown and integrity

| ID      | Priority | Requirement / acceptance boundary                                                                                                                                                                                               |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOCK-01 | P0       | A secure exam rejects attempt entry unless the request satisfies the exam's allowlisted SEB Config Key and/or Browser Exam Key validation policy using the official request-hash algorithms.                                    |
| LOCK-02 | P0       | Administrators produce a protected exam-specific `.seb` configuration with allowed origins/resources, kiosk restrictions, safe quit/restart behavior, and recorded checksum/version.                                            |
| LOCK-03 | P0       | Standard mode is labeled lower security and implements fullscreen/focus/visibility/clipboard/print/context-menu/shortcut deterrence, dynamic watermarking, and suspicious-event telemetry without claiming complete prevention. |
| LOCK-04 | P1       | Compatibility check and mock exam validate OS/SEB version, configuration launch, cookies, network, rendering, autosave, and safe exit before exam day.                                                                          |

### Evaluation, results, attendance, and reporting

| ID       | Priority | Requirement / acceptance boundary                                                                                                                                                                                       |
| -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCORE-01 | P0       | Server evaluation supports exact single/boolean, exact-set multi-select, documented absolute/relative numerical tolerance and rounding, positive/negative marks, section/total score, percentage, and grade boundaries. |
| SCORE-02 | P0       | Re-evaluation creates a new immutable result version with policy/version/reason/audit; it never silently replaces history.                                                                                              |
| RES-01   | P0       | Students see only their published result and only the question/correct-answer/explanation detail allowed by that result policy. Public identifiers replace internal Mongo identifiers.                                  |
| RES-02   | P1       | PDF marksheets contain the specified identity/exam fields, public verification ID, and generation timestamp.                                                                                                            |
| ATD-01   | P0       | Attendance is derived from server attempt events and distinguishes not started, started, in progress, submitted, auto-submitted, interrupted, resumed, terminated, and absent.                                          |
| ANA-01   | P1       | Reports compute documented summary/item statistics, display sample size, suppress misleading small-sample discrimination, and handle zero variance. Exports require permission and audit.                               |

### Notifications and audit

| ID     | Priority | Requirement / acceptance boundary                                                                                                                                                                                                                           |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOT-01 | P1       | In-portal and email notifications are durable, retryable, idempotent, templated, auditable, and provider-abstracted for SMTP, development catcher, and a future provider.                                                                                   |
| AUD-01 | P0       | Required security/academic events create append-only records including actor/target/time/request/network/outcome/reason and safe metadata.                                                                                                                  |
| AUD-02 | P0       | OTPs, tokens, passwords, correct answers, raw secrets, and full sensitive request bodies are never audit metadata. Audit writes fail closed for critical admin/academic transitions or use a transaction/outbox that guarantees eventual durable recording. |

## Quality and operational requirements

| ID      | Priority | Requirement / target                                                                                                                                                                                                                                                                                                        |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-01 | P0       | Capacity tests model 80 concurrent candidates, 30-second autosaves plus immediate changes, start/reconnect/submit bursts. Initial objective: p95 < 500 ms for saves and < 1 s for ordinary reads under the agreed environment, < 1% server error rate excluding deliberate rejection. Final SLOs require Phase 11 evidence. |
| REL-01  | P0       | No acknowledged answer is lost in a single app-process restart. Critical writes use majority concern in production and idempotent retry.                                                                                                                                                                                    |
| REL-02  | P0       | Recovery objectives are proposed as RPO <= 15 minutes and RTO <= 2 hours for production, subject to departmental approval and restore tests. Exam-day service recovery targets may need stricter infrastructure.                                                                                                            |
| SEC-01  | P0       | Target OWASP ASVS 5.0 Level 2; maintain a requirement/evidence matrix through Phase 10.                                                                                                                                                                                                                                     |
| SEC-02  | P0       | TLS, CSP, HSTS, origin/CORS allowlists, request/file limits, dependency/secret/static scans, safe errors, structured redacted logs, and least-privilege secrets are release gates.                                                                                                                                          |
| A11Y-01 | P1       | Target WCAG 2.2 AA for portal workflows, with documented SEB-compatible accommodations and no security-through-inaccessibility.                                                                                                                                                                                             |
| OPS-01  | P0       | Health differs from readiness; dependencies, migrations, disk/object store, mail backlog, clocks, certificates, and backups are observable.                                                                                                                                                                                 |
| PORT-01 | P1       | Linux OCI containers run as non-root, configure via environment/secrets, and use S3-compatible/SMTP/Mongo interfaces without provider-only logic in the domain layer.                                                                                                                                                       |
| PRIV-01 | P0       | Collect only necessary identity, attempt, security, and audit data; retention, access, export, correction, and deletion/legal-hold rules require institutional approval.                                                                                                                                                    |

## Requirements traceability

Each implementation PR from Phase 1 onward must reference requirement IDs. Automated tests should use IDs in names/tags where practical. Phase exit reports must distinguish implemented, tested, manually verified, deferred, and unverified controls; documentation alone is not implementation evidence.
