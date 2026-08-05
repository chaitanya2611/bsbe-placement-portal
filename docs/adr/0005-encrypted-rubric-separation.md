# ADR 0005: Separate and encrypt correct-answer rubrics

- Status: Accepted for implementation
- Date: 2026-08-02

## Context

Correct answers are more sensitive than candidate-facing question content and must be available to authoring validation/evaluation without leaking through student DTOs, logs, caches, database read paths, or backups.

## Decision

Keep candidate-safe content structurally separate from an authenticated-encrypted rubric envelope. Bind ciphertext to question/version identity as associated data and store a key ID. Keys come from managed secret/KMS facilities through a narrow decrypt port. Student serializers and queries have no rubric property. Attempt snapshots retain an encrypted scoring envelope/version sufficient for reproducible evaluation.

## Consequences

- Key rotation, backup key recovery, least-privilege decryption, audit, and failure handling are mandatory.
- Application-layer encryption limits damage from ordinary database reads/backups but not a fully compromised authorized evaluator runtime.
- Search/index pipelines must exclude encrypted answers, and post-publication detail is a separately authorized projection.
