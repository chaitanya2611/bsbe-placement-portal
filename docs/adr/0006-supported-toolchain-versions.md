# ADR 0006: Pin the latest mutually supported toolchain

- Status: Accepted for Phase 1
- Date: 2026-08-03

## Context

The latest standalone versions are not always mutually supported. On 2026-08-03, typescript-eslint 8.65.0 declared TypeScript support below 6.1 while TypeScript 7.0.2 was current. NestJS Mongoose 11.0.4 declared support for Mongoose 7/8 while Mongoose 9.9.1 was current.

## Decision

Pin TypeScript 6.0.3 and Mongoose 8.24.1, the newest stable releases within the declared peer ranges. Pin all direct dependencies exactly and commit `pnpm-lock.yaml`. CI and production containers use Node.js 24.18.0 LTS and pnpm 11.9.0.

## Consequences

- Peer checks are clean and the supported stack is reproducible.
- “Latest supported” is favored over forcing the newest incompatible major.
- Dependabot may report TypeScript 7 and Mongoose 9, but upgrades wait for dependent-tool support and passing tests.
- The compatibility hold is reviewed in every dependency update phase.
