# Bounded offline answer synchronization

## Security position

Offline support covers short accidental network interruptions, not an offline exam mode. A web client cannot prove when an offline edit occurred because its clock, JavaScript, storage, and monotonic timers are attacker-controlled. Therefore the server accepts a queued batch only if the synchronization request itself arrives before the server-issued offline lease expires and all ordinary attempt/section deadlines remain open.

If a request arrives after lease expiry, queued edits are **not automatically merged**, even if their client timestamps appear earlier. The attempt enters `PAUSED_INTEGRITY` (or is auto-submitted if a deadline has passed), new local answers stop, and recovery requires an authorized, reasoned workflow. This is intentionally conservative.

## Lease model

On start and each successful heartbeat/save, the server may return:

```text
leaseId: opaque random identifier
issuedAt: server UTC instant
expiresAt: server UTC instant
attemptRevision: integer
deviceSessionId: opaque bound identifier
maxBatchOperations: bounded integer
```

The lease is stored server-side; alternatively its integrity fields may be authenticated in an opaque token while revocation/current-lease state remains server-checkable. It is bound to attempt, active section, session/device, and revision range. The configurable window is short (proposed initial value: 2 minutes, subject to exam-owner/security review and load testing) and never exceeds the earliest section/total deadline.

The UI derives a countdown using the last observed server time plus `performance.now()` only for display/freeze behavior. That display is not acceptance evidence.

## Client operation

Each answer mutation becomes an immutable local operation:

```text
operationId / Idempotency-Key (random)
attemptPublicId
questionInstancePublicId
deviceSessionId
clientSequence (strictly increasing per attempt/device)
baseAttemptRevision
leaseId
answer payload
clientEventTimestamp (diagnostic only)
payloadHash
```

Rules:

1. Append to IndexedDB before attempting transmission, then show `Saving`.
2. A durable API acknowledgement changes the canonical UI to `Saved` and deletes/coalesces acknowledged local data.
3. Network failure shows `Offline` and `Pending synchronization`; never `Saved`.
4. While the local lease display remains open, later edits append/coalesce without exceeding operation and byte limits.
5. At displayed lease expiry, disable answer controls/navigation that would generate changes, show recovery-required guidance, retain the queue for reconciliation/evidence, and keep the authoritative exam timer visible if possible.
6. Never register background sync that can extend behavior beyond the live controlled exam page or leak authenticated exam data through a service worker.

## Online save algorithm

The server transaction/conditional operation checks:

- active authenticated user owns the attempt;
- session/device matches current binding and security revision;
- attempt and active section allow writes;
- server receipt precedes total/section deadline;
- lease is current and unexpired where required;
- question instance belongs to the active section/attempt;
- request idempotency key is unused or matches the original request hash;
- sequence is greater than the last accepted device sequence;
- expected/base revision does not hide a conflicting canonical answer.

It stores the normalized answer, sequence, payload hash, server receipt time, client timestamp as untrusted diagnostics, and new canonical revision. The response returns canonical state, server time, result code, and renewed lease if allowed.

## Sync batch protocol

`POST /api/v1/student/attempts/{attemptId}/answers/sync` contains a bounded ordered list. The server:

1. Resolves the attempt by owner and current binding without separately revealing existence.
2. Captures server receipt time and rejects normal merge if lease/section/attempt deadline is expired.
3. Validates all operations and payload size before applying any. A malformed or ownership-invalid batch applies none.
4. Sorts/verifies contiguous monotonic sequences as submitted; it does not trust timestamps for order.
5. Treats an identical known idempotency key/payload hash as duplicate success with its original outcome.
6. Rejects key reuse with another payload, lower sequences, foreign instances, or invalid answer shapes.
7. Applies non-conflicting operations in one transaction. The initial design uses all-or-nothing for a batch to make recovery unambiguous.
8. Returns per-operation disposition plus canonical answers/revision and a new lease.

Proposed dispositions: `accepted`, `duplicate`, `conflict`, `invalid`, `lease_expired`, `section_locked`, `attempt_terminal`, `device_mismatch`. Public error details remain safe.

## Conflict rules

| Situation                                                     | Resolution                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Same operation/key retried                                    | Return original result; no new revision                                                                       |
| Lower/equal sequence with different key                       | Reject as stale/replay                                                                                        |
| Higher sequence, matching base revision                       | Apply in order                                                                                                |
| Higher sequence, server has newer edit from same bound device | Return conflict and canonical state; client can discard acknowledged/stale local op; never silently overwrite |
| Write from old/transferred device                             | Reject and audit suspicious/recovery event                                                                    |
| Reconnect after lease expiry                                  | No automatic queued merge; pause/recovery or terminal submission                                              |
| Reconnect after section/total deadline                        | Reject queued changes; finalize from last durable server revision                                             |
| Batch partly invalid                                          | No partial commit in initial protocol; return dispositions/canonical state                                    |

Because one bound device is enforced, legitimate cross-device conflict should occur only during an exceptional audited transfer or stale replay.

## Recovery workflow after lease expiry

1. Server marks/returns `PAUSED_INTEGRITY` unless already terminal.
2. UI freezes and displays last durable server revision, pending operation count, and support instructions; it does not claim those pending answers were accepted.
3. Operator verifies identity/context, reviews outage telemetry without treating it as misconduct, and chooses terminate/auto-submit, resume from last durable answers, or an approved bounded extension/device transfer.
4. Any recovery creates reasoned audit entries and a new binding/lease/deadline revision. The default is **not** to merge unverifiable expired-lease operations.
5. If institutional policy permits a manual academic review of quarantined content, it is evidence outside automatic scoring and cannot silently modify the attempt answer set.

## Cleanup and privacy

- On terminal acknowledgement, delete attempt queues and cached candidate content from IndexedDB/memory; retain only a non-sensitive submission receipt if desired.
- On logout, prevent another account from seeing a queue. An orphan queue remains namespaced and opaque until same-account recovery or local expiry.
- Apply browser storage quotas, payload bounds, schema versioning, and corruption handling.
- Do not put session tokens in IndexedDB; cookies remain HttpOnly.

## Required tests

- Online immediate/periodic saves and status transitions.
- Lost response followed by idempotent retry.
- Reload/crash with pending and acknowledged operations.
- Reconnect just before/at/after lease and section/total deadlines using server-controlled clocks.
- Sequence gap/replay, key/payload mismatch, wrong attempt/question/device, stale revision, duplicate batch.
- Save versus submit/auto-submit/admin transfer races against a real MongoDB replica set.
- IndexedDB corruption/quota/cleanup and network reconnect burst for 80 students.
