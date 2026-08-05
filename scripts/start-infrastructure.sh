#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repository_root"

command -v docker >/dev/null || { printf 'Docker is required.\n' >&2; exit 1; }
docker compose up -d mongo mongo-init mailpit
docker compose ps
