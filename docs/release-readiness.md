# Release readiness and acceptance

## Automated gates

- [ ] Frozen dependency installation succeeds.
- [ ] Formatting, lint, strict type-check, build, and default tests pass.
- [ ] Real database, identity, question-bank, and complete exam lifecycle integration tests pass.
- [ ] Dependency audit, secret scan, CodeQL, and pinned container/filesystem scan pass or have documented time-bound exceptions.
- [ ] Production images are built once, scanned, signed, and referenced by immutable digest.
- [ ] The 500-concurrent-user staging rehearsal meets error <1%, p95 <750 ms, and p99 <1.5 s, with autosave/heartbeat/submission candidates included in the approved full rehearsal.

## Infrastructure and recovery

- [ ] Real HTTPS domain, valid certificate, HSTS, proxy trust, same-origin API path, CORS, cookie security, and Safe Exam Browser exact URL are verified.
- [ ] Production MongoDB replication/PITR, private S3 versioning, SMTP delivery, secret manager, monitoring, alerting, log retention/redaction, and clock synchronization are verified.
- [ ] Backup restore and application rollback have been rehearsed and measured against approved RPO/RTO.
- [ ] Capacity includes database/storage/API headroom and a documented scaling/connection-pool ceiling.

## Examination acceptance

- [ ] Administrator, student, SEB, accessibility, offline/reconnect, section timeout, expiry submission, result publication/unpublication, re-evaluation, exports, and incident workflows pass on supported devices.
- [ ] Eligibility roster, schedule/timezone, password handling, immutable exam version, question pools, grading rules, result visibility, fallback policy, and emergency owners receive two-person review.
- [ ] No real candidate records, placement questions, credentials, or vendor secrets exist in source or fixtures.
- [ ] Privacy/retention policy, candidate instructions, accommodations, support contacts, incident communications, and final go/no-go authority are approved.

## Known limitations

- Ordinary browser restrictions are deterrence; only a rehearsed native kiosk/SEB configuration provides stronger device controls.
- The repository supplies provider-neutral deployment artifacts but does not provision the institute’s domain, TLS, MongoDB, S3, SMTP, registry, monitoring, or secret manager.
- The safe baseline k6 profile cannot use real credentials. The institution must run the authenticated staging rehearsal with disposable accounts and preserve the report.
- Production email deliverability depends on the chosen provider’s sender verification, SPF/DKIM/DMARC, quota, and relay policy.
- Retention periods, accessibility accommodations, supported operating systems, and final examination policy require institutional decisions.

Release is approved only when every mandatory item is checked, exceptions have an owner/expiry, the exact image digests/configuration are recorded, and the designated technical and examination owners sign the go/no-go record.
