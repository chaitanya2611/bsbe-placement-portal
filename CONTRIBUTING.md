# Contributing

## Development rules

1. Work only within the authorized phase and reference Phase 0 requirement IDs where applicable.
2. Use Node 24 LTS and pnpm 11.9.0; do not create npm/yarn lockfiles.
3. Preserve strict TypeScript and module boundaries. Do not use `any`, bypass authorization, or place business rules in controllers.
4. Never add real student data, credentials, placement questions, correct answers, or hidden TODO implementations.
5. Add tests and documentation with every behavioral change.

Before proposing a change:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Architecturally significant changes require an ADR. Accepted ADRs are superseded by new records rather than rewritten.
