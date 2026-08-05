# Authentication operations

## First local setup

Replace `INSTITUTE_EMAIL_DOMAIN` in `.env` before creating accounts. Mailpit captures local OTP mail at `http://localhost:8025`.

PowerShell:

```powershell
Set-Location 'C:\Users\Admin\Documents\Exam Portal'
Copy-Item -LiteralPath '.env.example' -Destination '.env'
docker compose up -d --wait mongo mongo-init mailpit
pnpm migrate
pnpm seed -- --apply
pnpm bootstrap:admin -- --email walvekarchaitanya@gmail.com --name "Initial Administrator"
pnpm dev
```

Bash:

```bash
cd '/path/to/Exam Portal'
cp .env.example .env
docker compose up -d --wait mongo mongo-init mailpit
pnpm migrate
pnpm seed -- --apply
pnpm bootstrap:admin -- --email walvekarchaitanya@gmail.com --name 'Initial Administrator'
pnpm dev
```

The bootstrap refuses when any administrator already exists. It creates no password or default credential. Further administrator accounts must be created by a recently OTP-authenticated administrator.

## Login lifecycle

1. Browser gets `GET /api/v1/auth/csrf` and retains the signed cookie/token pair.
2. Browser requests an OTP. The API performs exact-domain, account-state, cooldown, email-window, and IP-window checks but always returns the same public message.
3. An eligible account receives a six-digit single-use code. A newer request invalidates older challenges.
4. Successful verification atomically consumes the challenge and creates a new opaque session token.
5. The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. The CSRF token rotates.
6. A student login follows `STUDENT_CONCURRENT_LOGIN_POLICY`. Replacement is forbidden whenever the session is bound to an active attempt.

Sensitive administrator calls return `RECENT_AUTHENTICATION_REQUIRED` after the configured age. Use `POST /auth/step-up/request`, retrieve the latest email code, then `POST /auth/step-up/verify`.

## Key generation and rotation

Generate four independent values. Example PowerShell using the pinned Node runtime:

```powershell
node -e "for (const name of ['OTP_PEPPER','SESSION_TOKEN_PEPPER','CSRF_SECRET','IP_HASH_KEY']) console.log(name+'='+require('node:crypto').randomBytes(32).toString('base64url'))"
```

Bash:

```bash
node -e "for (const name of ['OTP_PEPPER','SESSION_TOKEN_PEPPER','CSRF_SECRET','IP_HASH_KEY']) console.log(name+'='+require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store values in a secret manager, not source control or image layers.

- `OTP_PEPPER`: wait at least `OTP_TTL_SECONDS`, then rotate; outstanding codes become invalid.
- `SESSION_TOKEN_PEPPER`: revoke all sessions before rotation; every existing cookie becomes invalid.
- `CSRF_SECRET`: rotate during a maintenance window; browsers transparently obtain a new token after a rejected mutation.
- `IP_HASH_KEY`: rotate after preserving required abuse/audit evidence; old and new pseudonyms do not correlate.

## Incident actions

- Compromised user: deactivate the account. This increments its security revision and revokes active sessions.
- Stolen session: an administrator lists the account sessions and revokes the target with a required reason.
- Suspected OTP abuse: review pseudonymized audit/rate data; lower limits only after testing legitimate peak login bursts.
- SMTP outage: restore mail service. Created challenges are invalidated on delivery failure; Phase 2 has no durable queue.
- Suspected key leak: rotate the specific key using the rules above and retain a safe incident record.

Never query or print `otpHash`/`tokenHash` during routine operations. Never retrieve OTP plaintext from MongoDB; it is not stored.
