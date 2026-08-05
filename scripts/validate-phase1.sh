#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repository_root"

required_files=(
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs
  .env.example apps/api/package.json apps/api/src/main.ts apps/api/Dockerfile
  apps/web/package.json apps/web/src/main.tsx apps/web/Dockerfile
  packages/config/package.json packages/contracts/package.json packages/shared/package.json
  docker-compose.yml infra/mongodb/init-replica-set.js .github/workflows/ci.yml
  docs/phase-1/README.md docs/architecture.md docs/environment-reference.md
  docs/setup-windows.md docs/setup-docker.md docs/testing.md SECURITY.md CONTRIBUTING.md CHANGELOG.md
)

for file in "${required_files[@]}"; do
  test -f "$file" || { printf 'Missing required Phase 1 file: %s\n' "$file" >&2; exit 1; }
done

grep -Fq 'pnpm@11.9.0' package.json
grep -Fq '"typescript": "6.0.3"' package.json
grep -Fq '"@nestjs/core": "11.1.28"' apps/api/package.json
grep -Fq '"mongoose": "8.24.1"' apps/api/package.json
grep -Fq '"react": "19.2.8"' apps/web/package.json
grep -Fq '"vite": "8.2.0"' apps/web/package.json
grep -Fq 'mongo:8.0.28-noble' docker-compose.yml
grep -Fq 'axllent/mailpit:v1.30.0' docker-compose.yml

printf 'Phase 1 validation passed: %s required files and exact baseline pins verified.\n' "${#required_files[@]}"
