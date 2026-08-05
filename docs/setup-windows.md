# Local Windows setup

## Prerequisites

1. Install 64-bit Node.js 24 LTS, preferably 24.18.0.
2. Install pnpm 11.9.0 with Corepack or pnpm's documented installer.
3. Install and start Docker Desktop with Linux containers and Compose v2.
4. Verify:

```powershell
node --version
pnpm --version
docker --version
docker compose version
```

## Configure and install

```powershell
Set-Location 'C:\Users\Admin\Documents\Exam Portal'
Copy-Item -LiteralPath '.env.example' -Destination '.env'
pnpm install --frozen-lockfile
```

The example configuration accepts IIT Bombay addresses ending exactly in `@iitb.ac.in`. Production still requires independent non-development cryptographic keys.

The helper copies `.env` only when it does not exist:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

## Start development

For this initialized project, use the launcher that finds the bundled Codex Node/pnpm runtime when it is not already on `PATH`, starts Docker services, applies migrations and seed data, and starts both development servers:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-development.ps1
```

On a fresh database only, create the first administrator once:

```powershell
pnpm bootstrap:admin -- --email walvekarchaitanya@gmail.com --name "Initial Administrator"
```

Use the domain configured in `.env` in the bootstrap email. Bootstrap is intentionally one-time and refuses when an administrator already exists. View OTP mail in Mailpit at `http://localhost:8025`.

`pnpm dev` runs Vite and an API TypeScript compiler/Node watcher. Stop it with `Ctrl+C`.

```powershell
docker compose ps
docker compose logs mongo mongo-init mailpit
```

Stop while preserving data with `docker compose down`. To deliberately erase fictional local data, use `docker compose down --volumes`.

## Quality checks

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm seed
pnpm validate:phase2
```

See [authentication operations](phase-2/authentication-operations.md) and [testing](testing.md) for the opt-in integrations.
