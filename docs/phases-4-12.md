# Phases 4–12 implementation guide

## Delivered workflow

Phase 4 adds administrator exam creation, multiple timed sections, program eligibility, schedules, access passwords, question pools, selection counts, randomization rules, grading boundaries, result visibility settings, draft validation, immutable publication, cancellation, archival, and notifications.

Phase 5 adds student schedules, secure entry, authorization tokens, fixed question instances and option order, server-derived timers, immediate and 30-second saves, monotonic answer sequences, IndexedDB recovery, a 90-second offline lease, heartbeats, one-way section transitions, idempotent submission, and automatic expiry.

Phase 6 validates the official Safe Exam Browser Config Key request header, supports administrator-hosted `.seb` configuration links and audited fallback, binds attempts to device sessions, blocks common browser actions, records visibility/fullscreen/network events, rejects mobile layouts, and adds candidate watermarks. Browser controls are deterrence and evidence—not a claim that ordinary browsers can become a kiosk.

Phase 7 scores single choice, exact-set multiple select, true/false, and numerical tolerance rubrics. Published question/rubric versions are fixed to the attempt. Results begin unpublished, may be published/unpublished by a recently authenticated administrator, and can be re-evaluated into a new result version with an audit reason. Student views honor question-review and correct-answer settings.

Phase 8 adds live attendance (including never-started and absent candidates), suspicious-event counts, descriptive statistics, grades, facility index, corrected point-biserial with suppression below 10 samples, CSV/XLSX/PDF attendance, and PDF marksheets.

Phase 9 adds durable notification records, inbox state, idempotency keys, SMTP delivery, exponential retry, exam schedule/cancellation notices, and result-publication notices.

Phases 10–12 add strict quality gates, a real MongoDB lifecycle test, CI security checks, a 500-user k6 profile, production containers/reverse proxy, secret-driven production configuration, backup/restore scripts, operations guidance, rollback, and release acceptance.

## Primary APIs

- Administrator: `/api/v1/admin/exams`, lifecycle, live attendance, attempt actions, result publication/re-evaluation, analytics, and attendance exports.
- Student: `/api/v1/student/exams`, authorization/start, active attempt recovery, answer batch, heartbeat, section transition, integrity, submit, results, marksheet, notifications, and attempt-scoped media.
- Health: `/api/v1/health/live` and `/api/v1/health/ready`.

## Data guarantees

- A published exam version is immutable and references immutable question versions.
- Each student has at most one attempt per exam; start and submit requests carry idempotency keys.
- Random selections are generated once and persisted as attempt question instances.
- Saves are unique per attempt/question instance, ordered by client sequence, timestamped by the server, and constrained by attempt/device/offline state.
- Correct-answer rubrics remain separately AES-GCM encrypted and never appear in attempt payloads.
- Result versions and audit events are append-oriented; publishing controls visibility rather than recalculating silently.
