#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repository_root"

required_files=(
  README.md
  docs/phase-0/README.md
  docs/phase-0/01-requirements.md
  docs/phase-0/02-architecture.md
  docs/phase-0/03-threat-model.md
  docs/phase-0/04-data-flow.md
  docs/phase-0/05-data-model-and-index-plan.md
  docs/phase-0/06-api-module-map.md
  docs/phase-0/07-authorization-matrix.md
  docs/phase-0/08-state-machines.md
  docs/phase-0/09-offline-sync.md
  docs/phase-0/10-safe-exam-browser.md
  docs/phase-0/11-deployment-profiles.md
  docs/phase-0/12-implementation-roadmap.md
  docs/phase-0/13-risk-register.md
  docs/adr/README.md
  docs/adr/0001-modular-monolith.md
  docs/adr/0002-server-authority-and-immutable-versions.md
  docs/adr/0003-cookie-sessions.md
  docs/adr/0004-bounded-offline-lease.md
  docs/adr/0005-encrypted-rubric-separation.md
)

for file in "${required_files[@]}"; do
  test -f "$file" || { printf 'Missing required file: %s\n' "$file" >&2; exit 1; }
done

combined="$(find docs -type f -name '*.md' -print0 | xargs -0 cat)$(cat README.md)"
required_topics=(
  'OWASP ASVS 5.0'
  'X-SafeExamBrowser-RequestHash'
  'X-SafeExamBrowser-ConfigKeyHash'
  'PAUSED_INTEGRITY'
  'Idempotency-Key'
  'Asia/Kolkata'
  '<replace-with-real-domain>'
  '<cloud-provider>'
  '<object-storage-provider>'
  '<smtp-credentials>'
  '<department-logo>'
  '<final-branding-colours>'
)

for topic in "${required_topics[@]}"; do
  grep -Fq -- "$topic" <<<"$combined" || { printf 'Missing topic: %s\n' "$topic" >&2; exit 1; }
done

mermaid_count="$(grep -Rho -- '```mermaid' docs | wc -l | tr -d ' ')"
test "$mermaid_count" -ge 5 || { printf 'Expected at least 5 Mermaid diagrams; found %s\n' "$mermaid_count" >&2; exit 1; }

printf 'Phase 0 documentation validation passed: %s required files, %s Mermaid diagrams, and required topics/placeholders present.\n' "${#required_files[@]}" "$mermaid_count"
