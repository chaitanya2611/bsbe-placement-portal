# ADR 0002: Make the server authoritative and freeze academic versions

- Status: Accepted for implementation
- Date: 2026-08-02

## Context

Browser clocks/state are controllable, and editing published questions would prevent reproducing what a student saw or how a result was calculated.

## Decision

The server determines identity/authorization, UTC deadlines, section state, random seed/order, answer acceptance, final revision, submission, scoring, attendance, and result visibility. Publishing freezes exam/question versions. Starting materializes immutable attempt question/option/scoring snapshots sufficient for reproduction. Later edits/re-evaluations create new versions.

## Consequences

- Reload/reconnect never resets time/order.
- Additional version/snapshot storage and migration discipline are required.
- Client timestamps are diagnostic only.
- Reproduction tests and version retention become release requirements.
