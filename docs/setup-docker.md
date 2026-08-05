# Docker development setup

## Infrastructure only

The recommended workflow runs Node/pnpm on the host and MongoDB/Mailpit in Docker:

```powershell
docker compose up -d mongo mongo-init mailpit
docker compose ps
```

MongoDB is bound only to `127.0.0.1:27017` and initializes replica set `rs0`. Mailpit SMTP/UI are bound to `127.0.0.1:1025` and `127.0.0.1:8025`.

Bash equivalent:

```bash
docker compose up -d mongo mongo-init mailpit
docker compose ps
```

## Containerized application profile

The optional profile uses production validation. Set a real development institute domain, `SMTP_FROM`, independent non-development `OTP_PEPPER`, `SESSION_TOKEN_PEPPER`, `CSRF_SECRET`, `IP_HASH_KEY`, and rubric keys in ignored `.env` first. Configure `MEDIA_STORAGE_DRIVER=s3` plus a private `S3_BUCKET`; API startup fails closed when production storage is incomplete.

```powershell
docker compose --profile application up --build -d
docker compose ps
```

The web is at `http://localhost:4173`, API at `http://localhost:3000`, and Mailpit at `http://localhost:8025`.

This Compose file is for local development. Its HTTP origins, local volumes, and Mailpit are not production configuration. Run migrations, fictional program seeds, and one-time bootstrap from the host using [authentication operations](phase-2/authentication-operations.md).

## Verification

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health/live
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
Invoke-RestMethod http://localhost:4173/health/live
```

API readiness becomes `ok` only after `mongo-init` completes and a primary is elected.

`docker compose down` preserves volumes. `docker compose down --volumes` permanently removes local MongoDB and Mailpit data.
