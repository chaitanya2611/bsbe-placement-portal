# Operations guide

## Production ownership

Production activation requires an institution-owned HTTPS domain/certificate, MongoDB replica set or managed cluster with point-in-time recovery, S3-compatible private versioned storage, SMTP account, container registry, monitoring destination, and secret manager. Start from `.env.production.example`; never copy development peppers or rubric keys.

For Gmail SMTP, use `smtp.gmail.com`, port `465` with `SMTP_SECURE=true` (or port `587` with TLS upgrade if supported by policy), the full account address as `SMTP_USER`, and an App Password or institution-approved relay credential as `SMTP_PASSWORD`. Put it only in the deployment secret store or untracked `.env.production`, not in chat, source, CI logs, or screenshots. The configured sender must be authorized by that account/relay.

## Administrator workflow

1. Sign in with the administrator email and OTP; verify recent authentication before sensitive actions.
2. Maintain active programs and candidates. Candidates must use `@iitb.ac.in`; the administrator may use the configured external Gmail account.
3. Build and validate questions, then activate them. Create a draft exam, add programs/schedule/password/sections/pools, select result visibility and lockdown policy, and publish only after peer review.
4. On exam day, watch live attendance, heartbeats, and suspicious-event counts. Resume/extend/terminate only with a recorded reason and incident reference.
5. After submission, verify sample scoring and exports. Re-evaluate only with an approved reason. Publish results deliberately; unpublish if an incident is confirmed.

## Student workflow

1. Sign in with the OTP delivered to the registered IITB address.
2. Run the system/network check and, when required, open the administrator-provided `.seb` configuration.
3. Enter the exam password during the allowed window. Keep the page open; answers save immediately and every 30 seconds. The status indicator and offline deadline show whether the server has accepted recent work.
4. Complete each timed section before moving forward; earlier sections cannot be reopened. Submit once and wait for confirmation.
5. Published results and PDF marksheets appear in the portal. No score is visible before administrator publication.

## Exam-day runbook

- T−60 minutes: verify HTTPS, readiness, SMTP test, S3 read/write, database primary/replication, clock sync, available disk, current immutable image digests, and monitoring alerts.
- T−30: stop configuration changes, export the candidate roster, confirm the exam version/password/SEB policy with two administrators, and open the incident channel.
- During entry: compare eligible, not-started, started, and absent counts; investigate repeated authorization/lockdown failures without weakening global policy.
- During exam: track error rate, p95 latency, database connections/replication lag, container CPU/memory/restarts, SMTP backlog, last heartbeats, interrupted attempts, and suspicious-event clusters.
- At end: confirm auto-submission has settled, export attendance, snapshot audit evidence, reconcile result count with started attempts, and delay publication until approved.

## Backup, restore, and retention

- Enable provider point-in-time recovery and daily snapshots with a separate administrative account. Enable S3 versioning/object lock according to institute policy.
- Run `scripts/backup-mongodb.ps1` for an encrypted off-host logical backup before high-risk releases. It creates a gzip archive and SHA-256 sidecar.
- Restore only into an isolated recovery database first. `scripts/restore-mongodb.ps1` requires `-Confirmed`, drops conflicting collections, and must be followed by migrations, readiness checks, count reconciliation, login/exam smoke tests, and audit review.
- Perform and record a restore drill at least quarterly and before the first real examination. Define RPO/RTO and retention with the institute privacy owner; do not invent a retention period in code.
- Candidate identity, attempts, answers, integrity events, results, notifications, logs, backups, and object versions need documented retention/deletion/legal-hold rules. Audit records must not contain OTPs, passwords, rubric plaintext, session tokens, or SMTP credentials.

## Incident and rollback

1. Freeze result publication and new administrative changes; preserve logs/audit/metrics and identify the affected exam/version/time range.
2. For an application regression, route traffic to the last approved image digests. Database migrations are forward-compatible; do not manually delete new collections during rollback.
3. For database failure, fail over through the provider. Restore only after the incident commander approves the RPO/RTO tradeoff.
4. For suspected credential exposure, revoke sessions, rotate affected secrets/SMTP/S3/database credentials and peppers where operationally possible, and assess encrypted rubric key impact.
5. Communicate candidate instructions through approved channels. Record every attempt extension, fallback approval, re-evaluation, unpublication, and release decision.
