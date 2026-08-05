# Deployment profiles

## Shared provider-neutral shape

Both profiles use OCI images, a TLS reverse proxy, stateless API instances, a worker/scheduler role from the same modular codebase, MongoDB replica-set semantics, private S3-compatible storage, SMTP abstraction, secret injection, and external backups. Application containers run as non-root on read-only filesystems where practical, expose liveness/readiness endpoints, and write no durable state to container layers.

The cloud provider remains `<cloud-provider>`, object storage remains `<object-storage-provider>`, SMTP credentials remain `<smtp-credentials>`, and institute/branding values remain placeholders until supplied.

## Profile A: free or low-cost demonstration

Purpose: development, stakeholder demonstration, training with fictional data, and automated staging checks. **Not approved for a real examination.**

| Concern      | Demonstration design and limitation                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute      | One small always-on-if-available host or low-cost container service running proxy, web/API, worker; resource contention and platform sleep/cold start may occur |
| MongoDB      | Small managed free/dev cluster or container replica set; strict size/connection/performance limits and no assured availability                                  |
| Storage      | Local MinIO/S3-compatible development bucket; persistence/egress/backup guarantees may be weak                                                                  |
| Email        | Mailpit/mail catcher for development; no real OTP delivery, or a tightly limited SMTP sandbox                                                                   |
| Availability | No SLA, likely single region/host, maintenance/cold-start risk, no failover                                                                                     |
| Backup       | Best-effort scheduled encrypted export to separate storage; restore still tested, but limits may prevent production RPO                                         |
| Scale        | Useful for functional checks only; 80-user reliability is not inferred from this profile                                                                        |
| Data         | Fictional accounts/questions/results only; no real candidate or placement content                                                                               |

Free tiers may sleep, throttle CPU/network, limit connections/email/database/storage, lack durable disks/backups, change terms, and provide no service guarantee. None is described as sufficient for real departmental exams.

## Profile B: recommended always-on production

Purpose: real scheduled departmental examinations after security, load, recovery, and operational acceptance.

| Layer                       | Minimum proposed production shape                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DNS/TLS/edge                | Managed DNS, modern TLS certificate/renewal, DDoS/basic WAF/rate limiting, canonical origin, HSTS, CSP and security headers; only edge can reach proxy/app ingress                                |
| Reverse proxy/load balancer | At least two failure-domain-aware instances/service replicas, health routing, strict body/timeouts, trusted forwarded-header policy, no sticky session dependency                                 |
| Web/API                     | At least two warm instances sized from Phase 11, non-root immutable images, rolling deployment with readiness and connection draining                                                             |
| Worker/scheduler            | Redundant workers with leased idempotent jobs; singleton effects protected by DB leases/unique keys, not a single fragile process                                                                 |
| MongoDB                     | Managed or self-operated three-member replica set across failure domains, encryption, authentication/TLS, point-in-time/scheduled backup, alerts, tested restore, capacity headroom               |
| Object storage              | Private versioned S3-compatible bucket, server-side encryption, public-access block, restricted service identity, lifecycle/retention, malware quarantine/derived objects, separate backup policy |
| Email                       | Reliable SMTP/transactional service through abstraction, authenticated domain, delivery monitoring, rate/bounce policy; portal remains schedule source of truth                                   |
| Secrets/keys                | Managed secret/KMS capability, separate app/worker/deploy identities, rotation/versioning, break-glass and backup key recovery                                                                    |
| Observability               | Central structured logs/metrics/traces as needed, on-call alerts, immutable audit export, privacy-limited retention; dashboards tested before exam day                                            |
| Backup/DR                   | Encrypted automated DB and object backups in separate account/project where feasible; proposed RPO <= 15 min/RTO <= 2 h subject to approval; quarterly and pre-major-release restore exercises    |

## Network and container controls

- Data services have no public inbound access except tightly controlled administrative paths.
- Separate production/staging projects/accounts, credentials, domains, buckets, databases, and mail settings.
- Images are multi-stage, pinned by digest for release, scanned, produce SBOM/provenance, and contain no compiler/source/secret unnecessary at runtime.
- Runtime drops Linux capabilities, sets resource limits, uses a read-only root filesystem and bounded temporary volume where libraries permit, and runs as a fixed non-root UID.
- Outbound access is limited where practical to database, object storage, mail, key service, and observability endpoints.

## Availability and exam-day operations

Before each exam:

1. Freeze the release/configuration; verify certificate/domain/time sync and provider status.
2. Run readiness, synthetic login/system check, SEB hash, media, save, submit, mail, backup-age, and restore-evidence checks.
3. Confirm capacity/headroom from the exact production profile and schedule no maintenance/deployments.
4. Staff named exam operator, technical responder, departmental decision owner, and communication channel.
5. Export encrypted roster/exam identifiers for controlled contingency without exposing questions/answers.
6. Document go/no-go, delayed-start, cancellation, extension, and rescheduling authority.

During an incident, integrity takes priority over silently accepting unverifiable answers. Operators can pause/recover/extend only through reasoned audited commands. Status communications avoid candidate data and exam secrets.

## Health and readiness

- Liveness: process event loop responds; it does not query every dependency.
- API readiness: configuration validated, migrations compatible, Mongo can satisfy required read/write concern, key service available for required paths, clock within threshold, and critical audit/outbox path writable.
- Worker readiness: Mongo/outbox access, lease mechanism, required key/mail/storage adapters configured; mail failure may degrade notification readiness without falsely declaring answer API unsafe.
- Exam readiness dashboard: media integrity, scheduler lag, active instance count, DB pool/replication/space, save latency/error, audit failures, backup age, certificate expiry, and queue age.

## Backup, restore, and rollback design

- Back up MongoDB consistently with point-in-time capability where available; back up versioned objects and the key metadata needed to decrypt historical rubric/backups.
- Separate backup credentials from application credentials; encrypt, restrict, monitor, and periodically restore into an isolated environment.
- Restore validation checks counts/invariants, attempt/result/version hashes, media references, and application compatibility without sending real notifications.
- Releases use backward-compatible expand/migrate/contract changes. Roll back application images only while schema compatibility is proven; otherwise roll forward with a corrective release.
- Never “roll back” academic writes by restoring the whole production database over newer attempts. Use repair/reconciliation procedures with preserved evidence.

## Environment-variable categories

Exact names and validation arrive in Phase 1. Required categories include:

```text
NODE_ENV
PUBLIC_ORIGIN
API_ORIGIN
INSTITUTE_EMAIL_DOMAIN=<replace-with-real-domain>
DISPLAY_TIMEZONE=Asia/Kolkata
MONGODB_URI
SESSION_SECRET / SESSION_HASH_KEY references
CSRF secret/key reference
OTP pepper/key reference and expiry/rate policy
CORRECT_ANSWER_KEYRING reference
SMTP host/port/user/password/from placeholders
OBJECT_STORAGE endpoint/region/bucket/access identity placeholders
CORS_ALLOWED_ORIGINS
TRUSTED_PROXY configuration
OFFLINE_LEASE_SECONDS
logging/metrics/audit sink configuration
```

Secrets should be mounted/referenced through the chosen secret system rather than placed in committed `.env` files. `.env.example` in Phase 1 contains safe placeholders only.

## Production acceptance gates

- Phase 10 security review and authorization/leakage tests pass with accepted residual risks.
- Phase 11 exact-environment 80-user/burst tests meet approved SLOs with headroom.
- Backup restoration and release rollback/roll-forward exercises pass.
- SEB configs and supported client versions pass system-check through production edge.
- Operational guides, contacts, escalation, cancellation/rescheduling, data retention, privacy notice, and accommodations are approved.
- No real examination is hosted on Profile A.
