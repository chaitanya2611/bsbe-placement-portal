# Authorization matrix

## Model

Authorization is deny-by-default and evaluated on the server for every request. Roles are coarse entry points; permissions, resource ownership, exam assignment/state, session freshness, and attempt/device binding complete the decision.

Initial internal administrator permissions:

- `users:manage`, `admins:manage`
- `questions:author`, `questions:rubric-read`
- `exams:author`, `exams:publish`, `exams:operate`
- `results:evaluate`, `results:publish`
- `reports:read`, `reports:export`
- `notifications:manage`, `audit:read`, `system:read`

An initial administrator may hold all permissions, but the storage/policy model must not hard-code a single omnipotent role. Creating/granting administrators, rubric access, publishing, attempt overrides, exports, and audit access require step-up and are audited.

Legend: **Own** = own eligible resource only; **P** = explicit permission; **Step** = recent OTP/session; **Reason** = mandatory non-empty approved reason; **State** = lifecycle rule; **Bind** = active attempt device/session; **-** = denied.

## Resource/action matrix

| Resource/action                    | Unauthenticated                                       | Student                                                                  | Administrator                                                                           |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Request/verify OTP                 | Public but generic, domain/rate/CSRF-bootstrap policy | Same; active exam concurrency can deny new login                         | Same plus admin step-up policy                                                          |
| View current session/logout        | -                                                     | Own                                                                      | Own                                                                                     |
| View student schedule/system check | -                                                     | Own + eligible published schedule                                        | P for operational preview; no implicit impersonation                                    |
| Manage users/programs              | -                                                     | -                                                                        | P; admin grant requires Step; all writes audited                                        |
| Manage/revoke sessions             | -                                                     | Own current logout only                                                  | P + Step + Reason for another user                                                      |
| Create/edit draft question         | -                                                     | -                                                                        | `questions:author`; optimistic version                                                  |
| Read correct rubric                | -                                                     | Never during attempt; post-result only through allowed result projection | `questions:rubric-read` + Step + audit                                                  |
| Edit used/published question       | -                                                     | -                                                                        | New version only; P + audit                                                             |
| Upload/read media                  | -                                                     | Only media referenced by own authorized current view                     | P; upload validation; rubric media follows rubric permission                            |
| Create/edit draft exam             | -                                                     | -                                                                        | `exams:author` + State                                                                  |
| Validate/preview exam              | -                                                     | -                                                                        | Author permission; preview is watermarked/non-attempt and audited for sensitive content |
| Publish/cancel/archive exam        | -                                                     | -                                                                        | `exams:publish` + Step + State; Reason for cancel; audit                                |
| Download/configure SEB file/key    | -                                                     | Own eligible launch artifact only, no raw expected keys                  | `exams:publish` + Step; secret fields protected/audited                                 |
| Enter password/authorize attempt   | -                                                     | Own + eligible + session + schedule + SEB/fallback + rate                | No implicit start as student                                                            |
| Start/resume attempt               | -                                                     | Own + Bind + State; idempotent                                           | Operator may resume/transfer only through explicit command                              |
| Read attempt/questions             | -                                                     | Own + Bind; candidate-safe snapshot                                      | `exams:operate` for live status; content access separately scoped                       |
| Save/sync answer                   | -                                                     | Own + Bind + active section/deadline/lease/revision                      | Never edit student's answer                                                             |
| Submit attempt                     | -                                                     | Own + Bind + State                                                       | Termination is separate operator action                                                 |
| Send integrity event               | -                                                     | Own + Bind; allowlisted/rate-limited                                     | Operator can annotate review separately, not impersonate event                          |
| Resume/transfer/extend/terminate   | -                                                     | -                                                                        | `exams:operate` + Step + Reason + State + audit; optional dual approval policy          |
| View attendance                    | -                                                     | Own                                                                      | `reports:read` scoped to exam/program as configured                                     |
| Generate/re-evaluate result        | -                                                     | -                                                                        | `results:evaluate` + Step + Reason for re-evaluation + audit                            |
| Publish/unpublish results          | -                                                     | View own only after published                                            | `results:publish` + Step + State/Reason + audit                                         |
| View result detail/correct answers | -                                                     | Own published result + publication detail policy                         | P; rubric detail requires rubric permission/Step                                        |
| View analytics                     | -                                                     | -                                                                        | `reports:read`; suppression rules apply                                                 |
| Create/download export             | -                                                     | Own marksheet/report only                                                | `reports:export` + Step for sensitive export + audit; signed expiry                     |
| Send/manage notifications          | -                                                     | Read own                                                                 | `notifications:manage`; approved audience/template; audit                               |
| View audit                         | -                                                     | May view a safe subset of own integrity events only if policy enables    | `audit:read` + Step; redacted; query only                                               |
| Health/readiness detail            | Liveness only                                         | Basic status only                                                        | `system:read` for dependency detail                                                     |

## High-risk command requirements

| Command                                   | Extra controls                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create administrator / change permissions | Step-up, `admins:manage`, cannot accidentally remove last recovery admin, reason, notification, audit; consider two-person approval                           |
| Publish exam                              | Independent validation report tied to exact version hash; Step-up; warning if secure mode/fallback differs from policy                                        |
| Change exam password                      | New adaptive hash, invalidates prior authorizations as policy defines, no reveal, Step-up, audit without value                                                |
| Transfer attempt device                   | Verify current state/support identity process, revoke old binding/session first in transaction, reason, optional supervisor approval, notify candidate, audit |
| Extend/resume attempt                     | Server calculates new deadline, bounded policy, reason, before/after values in safe audit, no silent answer mutation                                          |
| Terminate attempt                         | Confirmation, Step-up, reason, idempotent final state, notification/appeal information                                                                        |
| Re-evaluate/publish result                | Immutable policy/result version, reason, diff summary, separation of evaluator/publisher where staffing permits                                               |
| Export reports/audit                      | Scope/row estimate, Step-up, private time-limited object, watermark/manifest, download audit and cleanup                                                      |

## Object-level policy examples

- A student lookup includes `{ publicId, userId: session.userId }`; a separate existence check is forbidden because it leaks another student's resource.
- An answer mutation resolves attempt + question instance together under the authenticated user and bound session. It cannot accept a question ID from another attempt even if that question is in the same exam.
- An admin's program/exam scope is added to every query if scoped administration is introduced. Role alone never widens the repository query.
- Publication checks are part of result query predicates, not a UI-only condition.
- Audit and exports use dedicated redacted projections and do not reuse internal domain documents.

## Test matrix obligation

For every protected route, test unauthenticated, wrong role, missing permission, wrong owner, wrong program/exam scope, stale step-up, wrong lifecycle state, wrong device session, revoked session, valid access, and identifier substitution. The test inventory must be generated or checked against the OpenAPI route list so new endpoints cannot escape coverage.
