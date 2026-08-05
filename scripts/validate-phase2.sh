#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repository_root"

required_files=(
  apps/api/src/identity/identity.module.ts
  apps/api/src/identity/auth.controller.ts
  apps/api/src/identity/auth.service.ts
  apps/api/src/identity/identity.models.ts
  apps/api/src/identity/access.guards.ts
  apps/api/src/identity/csrf.guard.ts
  apps/api/src/identity/session.service.ts
  apps/api/src/identity/bootstrap-admin.cli.ts
  apps/api/src/identity/migration.cli.ts
  apps/web/src/pages/portal-page.tsx
  tests/identity-security.test.mjs
  tests/identity-auth.integration.test.mjs
  docs/phase-2/README.md
  docs/phase-2/authentication-operations.md
  docs/phase-2/identity-data-model.md
  docs/adr/0007-passwordless-identity-and-signed-csrf.md
)

for file in "${required_files[@]}"; do
  test -f "$file" || { printf 'Missing required Phase 2 file: %s\n' "$file" >&2; exit 1; }
done

for name in OTP_PEPPER SESSION_TOKEN_PEPPER CSRF_SECRET IP_HASH_KEY; do
  grep -Fq "$name=" .env.example
done
for index_name in ttl_otp_cleanup ttl_session_expiry uq_active_student_session; do
  grep -Fq "$index_name" apps/api/src/identity/identity.models.ts
done
for future_module in questions media; do
  test ! -d "apps/api/src/$future_module" || { printf 'Phase 3 module exists during Phase 2: %s\n' "$future_module" >&2; exit 1; }
done

printf 'Phase 2 boundary validation passed: %s required files and security invariants verified.\n' "${#required_files[@]}"
