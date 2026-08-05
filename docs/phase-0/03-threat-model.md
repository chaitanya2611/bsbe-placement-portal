# Threat model

## Method and baseline

This model combines asset/threat analysis, STRIDE categories, misuse cases, and OWASP ASVS 5.0 Level 2 as the planned verification baseline. It is a design artifact, not evidence that controls are implemented. Phase 10 must map every applicable ASVS requirement to code/configuration/test evidence and record justified non-applicability.

## Protected assets

1. Candidate identity, eligibility, session, and privacy data.
2. Unpublished questions, correct answers, rubrics, exam passwords, and configuration keys.
3. Attempt question/option order, answer history, accepted revision, and deadlines.
4. Submission, score, grade, result publication, attendance, and marksheets.
5. Administrator privileges, override capabilities, export access, and notification authority.
6. Audit trail, logs, cryptographic keys, application secrets, backups, and supply chain.
7. Availability during scheduled exams and recoverability after failure.

## Adversaries and misuse

- An external attacker seeking accounts, data, disruption, or infrastructure access.
- A student seeking unauthorized entry, answer leakage, timer/order manipulation, replay, multiple sessions, another student's attempt, or avoidance of lockdown.
- A compromised student endpoint/session or malicious browser extension.
- A malicious/compromised administrator changing questions/results or hiding an override.
- A dependency, CI, mail, storage, backup, or cloud compromise.
- Accidental operator error, misconfiguration, clock drift, or capacity failure.

## Threat register

| Threat                                           | STRIDE  | Principal preventive/detective controls                                                                                                           | Residual risk / validation                                                                                                                                                 |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account takeover / student impersonation         | S       | Pre-provisioning, domain check, hashed short-lived OTP, attempt limits, rate limits, generic responses, session rotation, security notice         | Compromised institute mailbox can receive OTP. Require institutional mail security and consider phishing-resistant admin MFA later. Test enumeration/brute force/fixation. |
| OTP brute force, replay, or log leakage          | S/I     | CSPRNG, single use, predecessor invalidation, keyed slow hash, per-challenge counter/lock, TTL, redaction                                         | Distributed IP attacks remain possible; layer edge/global anomaly limits.                                                                                                  |
| Email enumeration                                | I       | Same status/body shape and comparable processing, no different mail behavior visible to caller, throttling                                        | Email delivery side channels may exist to mailbox owner; acceptable because they control inbox.                                                                            |
| Session theft/fixation/replay                    | S/E     | Opaque rotated cookie, HttpOnly/Secure/SameSite, CSRF/origin, short/admin age, server revocation, hashed token, device-session/attempt binding    | Endpoint malware can act through a live browser. SEB reduces some paths, not device compromise.                                                                            |
| Concurrent login / device transfer abuse         | S/E     | Unique active student-session invariant, active-attempt denial, device-session binding, transactional revoke, reasoned admin transfer             | Legitimate hardware failure needs disciplined support workflow.                                                                                                            |
| Unauthorized exam start / password guessing      | E       | Eligibility/schedule/attempt/SEB checks, adaptive password hash, independent rate limit, generic denial, idempotent transaction                   | Shared exam password can leak; it is an additional gate, not identity.                                                                                                     |
| Question or correct-answer leakage               | I       | Separate student DTO/query, encrypted rubric, no-store, private media, least privilege, pre-publication scans/tests                               | Authorized authors can leak content; administrative governance and audit needed.                                                                                           |
| Timer/client clock manipulation                  | T       | Server instants/deadlines, server receipt timestamps, monotonic sequence, periodic heartbeat, bounded lease, deadline conditional writes          | Offline edits cannot be timestamp-proven; reject/quarantine after lease expiry.                                                                                            |
| API tampering / IDOR / broken access control     | T/E/I   | Deny-default guards, ownership filters in use case/repository, public opaque IDs, validation, authorization matrix tests                          | New endpoints can omit policy; central default guard and test inventory required.                                                                                          |
| Answer replay/overwrite/conflict                 | T/R     | Idempotency key, unique operation record, client sequence, expected revision, device binding, conditional update, audit                           | Malicious authorized client may send rapid changes; latest valid server-received sequence wins.                                                                            |
| Submission/autosave race or duplicate evaluation | T/R     | `FINALIZING` compare-and-set, final revision snapshot, transaction, unique result version/dedup key, recovery worker                              | Database outage can delay visible completion; retry returns canonical status.                                                                                              |
| Randomization manipulation                       | T       | Server CSPRNG seed, persisted immutable instances/order, snapshot hash, no client seed authority                                                  | Admin pool bias remains governance risk; publish validation/review.                                                                                                        |
| NoSQL/operator injection / mass assignment       | T/E     | DTO allowlists, strict schemas, reject operator-bearing shapes, repository-owned filters, safe query builders, tests                              | Search/filter builders require targeted injection tests.                                                                                                                   |
| Stored/reflected XSS, unsafe LaTeX/media         | T/E/I   | React encoding, sanitizer where HTML unavoidable, KaTeX safe config, CSP/nonces, disallow unsafe SVG, signature validation, separate media origin | Scientific formats are complex; render to safe image in isolated worker and fuzz/test parsers.                                                                             |
| CSRF / login CSRF                                | S/T     | SameSite plus per-session CSRF token, Origin/Fetch Metadata checks, narrow CORS, no state-changing GET                                            | Misconfigured proxy/origin allowlist can invalidate defenses; deployment test required.                                                                                    |
| Malicious upload/path traversal                  | T/E     | Magic-byte allowlist, parser limits, generated object keys, private bucket, quarantine/scan, safe derivation, no path input                       | Novel parser exploits; keep isolated, patched, resource-constrained processing.                                                                                            |
| Lockdown bypass                                  | S/T     | SEB request-hash allowlist, protected signed config when supported, allowed URLs, mock check, standard-mode exception workflow                    | SEB cannot stop second devices/collusion or all OS compromise. Integrity events are indicators, not automatic guilt.                                                       |
| Denial of service / exam burst                   | D       | Edge/app limits, per-route budgets, indexed queries, bounded payloads, pre-scaling, load tests, readiness, backpressure                           | Provider/regional outage remains; exam-day contingency and rescheduling authority required.                                                                                |
| Audit tampering/omission                         | R/T     | Append-only API, separate permission, transaction/outbox for critical events, hash-chain/batch seal option, external immutable export, clock sync | DB/platform super-admin can alter data; external WORM/independent review recommended for production.                                                                       |
| Administrator misuse                             | E/T/R/I | Least privilege, step-up, reason, possible dual approval, immutable versions, audit, periodic access review, export controls                      | Authorized insider risk cannot be eliminated technically. Department owns governance.                                                                                      |
| Secret/key leakage                               | I/E     | Secret manager, workload identities, no source/env dumps, redaction, rotation, scoped keys, incident runbook                                      | Runtime compromise may access keys; minimize decrypt permission and monitor.                                                                                               |
| Dependency/CI compromise                         | T/E     | Lockfile, reviewed updates, provenance/SBOM, SAST/SCA/secret scans, protected branch/environment, pinned actions/images                           | Ecosystem zero-days persist; rapid patch and rollback process required.                                                                                                    |
| Backup exposure or failed recovery               | I/D     | Encrypted protected backups, separate access, retention, restore tests, key recovery, deletion policy                                             | Backup provider/admin compromise and unrehearsed restore remain material.                                                                                                  |
| Email/notification abuse or duplication          | S/R/D   | Outbox, template allowlist, dedup key, provider abstraction, retry caps, suppression/rate control                                                 | Delivery timing is external; portal remains canonical schedule source.                                                                                                     |

## Security invariants

- A request with a valid session is not necessarily authorized for its resource.
- The server and database, not the browser, determine current time, attempt state, accepted answer, and score.
- No student exam response type contains rubric/correct-answer fields, even as `null` or hidden JSON.
- No published exam/question version is updated in place.
- Only the bound device session may write an active attempt; transfers invalidate the predecessor first.
- Every privileged override has an actor, fresh authentication policy, mandatory reason, and durable audit event.
- A security-critical transition is not reported successful until both academic data and its audit/outbox guarantee are durable.
- Detection events inform review; they do not automatically assert misconduct.

## Abuse-case tests required later

- Enumerate emails through status, body, timing, rate-limit, and mail-trigger behavior.
- Replay OTPs, cookies, CSRF tokens, save keys, sync batches, and submit operations.
- Attempt student-to-student and student-to-admin ID substitutions across every endpoint.
- Vary clocks/timezones, sequences, revisions, device-session IDs, deadlines, and reconnect times.
- Search every student payload/cache/log for answer/rubric/explanation leakage.
- Exercise Mongo operators/prototype-pollution shapes, XSS payloads, malformed scientific media, oversized/decompression-bomb inputs, and traversal names.
- Race start/save/section transition/submit/termination/result generation under real Mongo transactions.
- Validate SEB request hashes through the actual reverse proxy and reject altered/missing configuration evidence.

## Privacy and safety constraints

No webcam, microphone, facial recognition, hidden capture, screen proctoring, or invasive fingerprinting is in scope. IP address and reduced user-agent summary are security/audit data with access and retention restrictions. Watermarks use the minimum identity needed for deterrence. Suspicious-event logs require contextual human review and an appeal/incident procedure.

## Review cadence

Review this model at each phase boundary, before every real examination, after material dependency/architecture changes, and after incidents. The security owner records accepted residual risks in the [risk register](13-risk-register.md); developers cannot silently accept academic or privacy risk.
