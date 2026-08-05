#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repository_root"

required_files=(
  apps/api/src/question-bank/question-bank.module.ts
  apps/api/src/question-bank/question.models.ts
  apps/api/src/question-bank/question.service.ts
  apps/api/src/question-bank/media.service.ts
  apps/api/src/question-bank/rubric-crypto.service.ts
  apps/api/src/question-bank/chemical-validation.service.ts
  apps/web/src/components/question-bank.tsx
  packages/contracts/src/questions.ts
  tests/question-bank-security.test.mjs
  tests/question-bank.integration.test.mjs
  docs/phase-3/README.md
  docs/phase-3/question-bank-data-model.md
)

for file in "${required_files[@]}"; do
  test -f "$file" || { printf 'Missing required Phase 3 file: %s\n' "$file" >&2; exit 1; }
done
for name in QUESTION_RUBRIC_KEYS_JSON QUESTION_RUBRIC_ACTIVE_KEY_VERSION MEDIA_STORAGE_DRIVER MEDIA_MAX_BYTES MEDIA_MAX_PIXELS; do
  grep -Fq "$name=" .env.example
done
for index_name in uq_question_version_number uq_question_version_rubric uq_question_exam_version_usage; do
  grep -Fq "$index_name" apps/api/src/question-bank/question.models.ts
done
test ! -d apps/api/src/exams || { printf 'Phase 4 exam module exists during Phase 3.\n' >&2; exit 1; }

printf 'Phase 3 boundary validation passed: %s required files and security invariants verified.\n' "${#required_files[@]}"
