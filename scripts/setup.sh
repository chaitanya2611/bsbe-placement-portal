#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repository_root"

command -v node >/dev/null || { printf 'Node.js is required.\n' >&2; exit 1; }
command -v pnpm >/dev/null || { printf 'pnpm is required.\n' >&2; exit 1; }

printf 'Using Node.js %s and pnpm %s\n' "$(node --version)" "$(pnpm --version)"

if [[ ! -f .env ]]; then
  cp .env.example .env
  printf 'Created .env from .env.example; review placeholders before running the API.\n'
fi

pnpm install --frozen-lockfile
printf 'Workspace dependencies installed.\n'
