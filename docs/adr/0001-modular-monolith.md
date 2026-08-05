# ADR 0001: Use a modular monolith

- Status: Accepted for implementation
- Date: 2026-08-02

## Context

The initial system serves about 80 concurrent candidates and 20 exams. Attempt start, answer finalization, audit, and publication require coherent authorization and database transactions. Independent service ownership/scale has not been demonstrated.

## Decision

Build one NestJS codebase with strict domain modules and ports/adapters. Deploy stateless API and background worker/scheduler process roles from the same versioned artifact. Use one React application with role-separated routes/read models and shared contract/config packages.

## Consequences

- Cross-domain invariants, authorization, transactions, local development, and incident diagnosis stay simpler.
- Modules must not bypass each other's application interfaces or share arbitrary Mongoose models.
- Worker failure can be isolated operationally without creating a separate product/service contract.
- Only load/ownership evidence can justify future extraction; extraction requires a new ADR.
