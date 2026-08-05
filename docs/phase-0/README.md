# Phase 0 design index

## Outcome

Phase 0 converts the project brief into an implementable, security-led design. It does not implement application features.

## Project constraints restated

1. The system is a real examination system for approximately 80 concurrent students and must prefer integrity and recoverability over convenience.
2. It is a provider-neutral TypeScript monorepo: React/Vite in the browser, NestJS REST API, MongoDB/Mongoose, pnpm, Docker/Compose, OpenAPI, and GitHub Actions.
3. OTP authentication is limited to pre-provisioned, active institute-domain accounts. Authentication responses resist enumeration and authenticated state uses revocable server-side sessions in secure cookies.
4. All security decisions with academic consequences are server-side: authorization, timing, attempt ownership, randomization, answer acceptance, submission, evaluation, and result publication.
5. Secure examinations require validated Safe Exam Browser configuration. A standard browser is an explicitly lower-security fallback, not an equivalent lockdown mechanism.
6. Offline support is temporary and bounded. It cannot turn a browser clock into an authority or allow indefinite disconnected examination.
7. Correct answers never enter student exam payloads. Historical attempts remain reproducible through immutable snapshots and encrypted answer/rubric material.
8. Sensitive administrator actions, attempt lifecycle events, exports, and detectable integrity events are append-only audited with redaction.
9. Production uses TLS, always-on services, protected backups, private S3-compatible storage, durable email processing, health/readiness checks, and non-root containers.
10. Phase 0 ends after documentation and design validation. Phase 1 requires the explicit instruction `Continue to Phase 1`.

## Contradictions and design resolutions

| Tension                                                            | Resolution                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline answer entry versus server-authoritative deadlines         | A short server-issued lease permits continued entry only while reconnecting before lease expiry. If the server sees the client only after expiry, unsynchronized changes are quarantined/rejected and controlled recovery is required. A client timestamp is never deadline proof. |
| Service worker/PWA convenience versus stale or cached exam content | The service worker must never cache authenticated API responses, exam HTML/data, answers, session material, or SEB configuration. PWA use is limited to a shell/system-check where it cannot expose stale exam state.                                                              |
| “Browser lockdown is mandatory” versus standard-browser mode       | Production secure exams require SEB. Standard mode is limited to practice/testing or a named, time-bounded administrator exception with reason and audit record. JavaScript controls are deterrence and telemetry only.                                                            |
| One student session versus crash recovery                          | A stable server-side device-session binding permits the same authorized session to resume; a second device is denied while the attempt is active. Transfer is an administrator workflow, never silent fingerprint matching.                                                        |
| TTL cleanup versus academic retention                              | TTL applies only to ephemeral OTP/session/idempotency operational data. Results, attempts, versions, and audit events have policy-based archival and cannot be automatically deleted by TTL.                                                                                       |
| Editable questions versus historical fidelity                      | Publishing creates immutable exam and question versions plus attempt snapshots. Later edits create a new version.                                                                                                                                                                  |
| Encrypted correct answers versus server evaluation                 | Correct-answer payloads are application-layer authenticated-encrypted with a managed key identifier. Only the evaluation/admin-authoring paths can decrypt; student serializers are separate and structurally omit these fields.                                                   |
| Dynamic SEB configuration versus dependable validation             | Phase 1+ will implement only documented SEB Config Key/Browser Exam Key request-hash validation, with exact canonical URL handling and pre-exam compatibility tests. No user-agent-only trust.                                                                                     |
| MongoDB transactions versus provider portability                   | The production database must be a replica set (including single-node replica set in development) so transaction-dependent flows behave consistently.                                                                                                                               |

## Assumptions

- The department will supply the institute domain, departmental identity assets, retention policy, grading policy, exam support contacts, and approved administrator list before production acceptance.
- The initial production audience uses supported desktop Windows/macOS devices. Mobile devices are rejected for secure examinations.
- Administrators are a small trusted group, but least privilege, step-up authentication, dual review for high-impact overrides where operationally feasible, and audit review still apply.
- Email OTP delivery is acceptable for initial authentication; it is not assumed to be phishing-resistant. Admin authentication receives stricter session age and step-up requirements.
- One attempt per student per exam is the initial policy. The schema retains `attemptNumber` for a future explicitly approved policy.
- The system display timezone defaults to `Asia/Kolkata`; persisted timestamps are UTC instants and each exam stores an IANA timezone for presentation/audit context.
- A secure reverse proxy terminates TLS and passes only trusted forwarding metadata. Direct public access to app containers is blocked.
- The primary database, object storage, mail service, and backups are deployed in an approved jurisdiction chosen by the department.
- Exam questions and results are academically sensitive records. Backups receive the same confidentiality and retention controls as live data.
- Accessibility exceptions that conflict with SEB lockdown settings are handled through documented approved accommodations, not ad hoc weakening for all candidates.

## Unresolved project placeholders

| Purpose                | Placeholder                  |
| ---------------------- | ---------------------------- |
| Institute email domain | `<replace-with-real-domain>` |
| Department logo        | `<department-logo>`          |
| Final branding colors  | `<final-branding-colours>`   |
| SMTP credentials       | `<smtp-credentials>`         |
| Cloud platform         | `<cloud-provider>`           |
| Object storage         | `<object-storage-provider>`  |

## Out of scope for the initial release

- Remote proctoring, webcam/microphone capture, biometrics, facial recognition, screen recording, and invasive browser/device fingerprinting.
- Native mobile applications and secure exams on mobile devices.
- AI-generated questions, automated subjective grading, essay questions, coding sandboxes, and live interviews.
- Payment, public self-registration, social login, password authentication, multi-tenant departments, and external recruiter access.
- A claim that JavaScript can prevent screenshots, operating-system switching, secondary devices, virtual machines, or collusion.
- Microservices, event sourcing as the primary persistence model, multi-region active-active writes, and unlimited offline examinations.
- Building or modifying SEB itself, hosting SEB screen proctoring, or inventing proprietary SEB headers.
- Legally binding digital signatures on marksheets; the initial verification identifier provides online verification subject to authorization policy.

## Documents

| Document                                                        | Purpose                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Requirements](01-requirements.md)                              | Functional and quality requirements with acceptance boundaries    |
| [Architecture](02-architecture.md)                              | Components, trust boundaries, data flow, and major decisions      |
| [Threat model](03-threat-model.md)                              | Assets, actors, threats, controls, and residual risk              |
| [Data flows](04-data-flow.md)                                   | Context and security-critical flow diagrams                       |
| [MongoDB model and index plan](05-data-model-and-index-plan.md) | Collections, relationships, validation, indexes, and transactions |
| [API module map](06-api-module-map.md)                          | Versioned module and endpoint responsibilities                    |
| [Authorization matrix](07-authorization-matrix.md)              | Deny-by-default role/resource decisions                           |
| [State machines](08-state-machines.md)                          | Exam, attempt, and section transitions                            |
| [Offline synchronization](09-offline-sync.md)                   | Lease, queue, conflict, and recovery protocol                     |
| [SEB integration](10-safe-exam-browser.md)                      | Official key validation approach and operating workflow           |
| [Deployment profiles](11-deployment-profiles.md)                | Demonstration and always-on production designs                    |
| [Roadmap](12-implementation-roadmap.md)                         | Phase gates and verification objectives                           |
| [Risk register](13-risk-register.md)                            | Prioritized risks, owners, mitigations, and acceptance gates      |
| [ADRs](../adr/README.md)                                        | Architectural decision records                                    |

## Proposed final documentation structure

```text
docs/
|-- phase-0/                     # Current design baseline
|-- adr/                         # Immutable architectural decisions
|-- architecture.md              # Maintained architecture after Phase 1
|-- api-guide.md
|-- database-design.md
|-- threat-model.md
|-- security-requirements.md
|-- environment-reference.md
|-- setup-windows.md
|-- setup-docker.md
|-- deployment.md
|-- admin-guide.md
|-- student-guide.md
|-- safe-exam-browser.md
|-- exam-day-operations.md
|-- backup-restore.md
|-- incident-response.md
|-- data-retention.md
|-- testing.md
|-- reports/
|   |-- load-test-template.md
|   `-- security-test-template.md
`-- known-limitations.md
```

Root-level release documentation planned for later phases: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `CHANGELOG.md`.

## Phase 0 completion gate

- [x] Constraints, assumptions, contradictions, and scope recorded.
- [x] Architecture and security baseline proposed.
- [x] Threat model and data-flow diagrams created.
- [x] MongoDB entity model and index plan created before repositories.
- [x] API modules and deny-by-default authorization matrix defined.
- [x] Exam, attempt, and section state machines defined.
- [x] Bounded offline synchronization protocol defined.
- [x] Official SEB integration mechanisms distinguished from browser deterrents.
- [x] Demo and production deployment profiles described.
- [x] Implementation roadmap and risk register created.
- [x] Architectural decisions recorded.
- [ ] Departmental/security owner review and formal acceptance (external gate).
