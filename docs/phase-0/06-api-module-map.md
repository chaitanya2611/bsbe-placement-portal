# API module map

## Conventions

- Base path: `/api/v1` with OpenAPI generated from the same validated contracts.
- Cookie session authentication, CSRF token on all state-changing browser requests, strict Origin/Fetch Metadata validation, and narrow credentialed CORS.
- Deny-by-default global authentication/authorization guards; explicitly public routes are annotated and inventoried.
- JSON errors use a stable safe shape: `code`, `message`, `correlationId`, optional field `details`; no stack/database internals.
- Public opaque identifiers, ISO 8601 UTC timestamps, IANA timezone fields, bounded pagination, allowlisted sort/filter fields, and payload/request time limits.
- `Idempotency-Key` is required for attempt start, save/sync, transition, submission, and side-effecting admin commands where retry is likely. Reuse with a different request hash is rejected.
- OpenAPI has separate student-safe and admin schemas. Correct-answer properties do not exist in student exam schemas.

## Modules and endpoint families

| Module                      | Representative routes                                                                                   | Principal policies / notes                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Platform                    | `GET /health/live`, `GET /health/ready`, `GET /meta/time`, `GET /meta/config`                           | Liveness is minimal/public; readiness detail restricted; config exposes only safe flags                                  |
| Authentication              | `POST /auth/otp/requests`, `POST /auth/otp/verifications`, `POST /auth/logout`, `POST /auth/step-up`    | Generic public failures; strict rate limits; rotation/CSRF bootstrap; no OTP in response outside controlled test adapter |
| Sessions                    | `GET /sessions/current`, `DELETE /sessions/current`, admin `GET/DELETE /admin/users/{id}/sessions/{id}` | Own current session; admin revoke requires permission/reason/step-up                                                     |
| User administration         | `/admin/users`, `/admin/programs`, activation/deactivation/import preview/commit                        | Admin-only fine-grained permissions, optimistic concurrency and audit                                                    |
| Student dashboard           | `GET /student/exams`, `/student/attendance`, `/student/notifications`                                   | Own eligible/published data only; schedule is not attempt authorization                                                  |
| Question bank               | `/admin/questions`, `/versions`, `/preview`, clone/archive/search                                       | Rubric endpoints independently privileged and step-up/audited; version immutability                                      |
| Media                       | `/admin/media` upload/finalize/status, `GET /media/{publicId}/access`                                   | Quarantine/signature scan; signed short-lived access only when actor/resource policy permits                             |
| Exam administration         | `/admin/exams`, `/versions`, `/validate`, `/publish`, `/schedule`, `/clone`, `/archive`, `/cancel`      | Draft optimistic concurrency; publish/cancel require permission, reason as applicable, audit/outbox                      |
| SEB configuration           | `/admin/exams/{id}/lockdown-config`, `/student/system-check`, `/student/exams/{id}/launch`              | Key material admin-only/encrypted; launch config policy; check never grants exam authorization by itself                 |
| Attempt authorization/start | `POST /student/exams/{id}/authorize`, `POST /student/exams/{id}/attempts`                               | Eligibility/schedule/password/SEB/session in transaction; strict rate/idempotency                                        |
| Attempt read                | `GET /student/attempts/{id}`, `/questions`, `/state`, `/time`                                           | Owner + bound session; candidate-safe snapshot only; no answers/rubrics in question DTO                                  |
| Answers                     | `PUT /student/attempts/{id}/questions/{instanceId}/answer`, `POST .../answers/sync`                     | Bound device, active section/deadline/lease, monotonic revision/idempotency; small bounded batch                         |
| Sections/heartbeat          | `POST .../heartbeat`, `POST .../sections/{sectionId}/enter                                              | complete`                                                                                                                | Server computes deadline/state; transition idempotent and audited |
| Integrity events            | `POST .../integrity-events`                                                                             | Allowlisted types, bounded/deduped/rate-limited; telemetry cannot control guilt/outcome automatically                    |
| Submission                  | `POST /student/attempts/{id}/submission`                                                                | Conditional idempotent finalization; late call returns canonical auto-submit/terminal receipt                            |
| Live operations             | `/admin/exams/{id}/attempts`, attempt resume/transfer/extend/terminate commands                         | Specific operator permissions, step-up, reason, optimistic state, prominent audit                                        |
| Attendance                  | student own and `/admin/exams/{id}/attendance`                                                          | Derived from server events; admin pagination/export permissions                                                          |
| Results                     | student `/student/results/{id}`; admin generate/re-evaluate/publish/unpublish                           | Publication and detail policy in query; re-evaluation adds version/reason/audit                                          |
| Analytics                   | `/admin/exams/{id}/analytics/*`                                                                         | Minimum sample/suppression metadata, version/cutoff, admin-only                                                          |
| Exports                     | `POST /admin/exports`, `GET /admin/exports/{id}`, signed download                                       | Async, scoped parameters, private object, expiry, step-up for sensitive export, audit                                    |
| Notifications               | student inbox/read; admin templates/announcements/schedule sends                                        | Template allowlist, outbox/dedup, no arbitrary headers/recipient injection                                               |
| Audit                       | `/admin/audit-events` and controlled export                                                             | Auditor/admin permission, immutable query only, redacted projection                                                      |

## Endpoint policy metadata

Every handler must declare and OpenAPI-document:

1. Authentication requirement and role/permission.
2. Resource ownership/scope resolver.
3. CSRF/origin policy.
4. Rate-limit class and request-size class.
5. Idempotency behavior.
6. Audit event on success/failure where applicable.
7. Data classification and serializer projection.
8. Expected state/version preconditions and conflict response.

CI will compare the route inventory against this metadata and fail on an unclassified protected endpoint.

## Status and error semantics

- `400` invalid syntax/shape; `401` no valid authentication; `403` authenticated but policy denies; `404` may intentionally hide resource existence; `409` state/revision/idempotency conflict; `410` expired/terminal grant where disclosure is safe; `422` domain validation; `429` throttled; `503` dependency not ready.
- Authentication and exam access responses use safe generic codes to prevent enumeration or leaking schedule/password/eligibility distinctions when inappropriate.
- Retriable responses identify retry safety and correlation ID without revealing infrastructure.

## OpenAPI release gate

All routes need operation IDs, tagged modules, request/response schemas, security/CSRF notes, documented errors, pagination, and examples made from fictional data. Automated contract tests confirm that candidate endpoints cannot serialize rubric/correct-answer/internal-key fields.
