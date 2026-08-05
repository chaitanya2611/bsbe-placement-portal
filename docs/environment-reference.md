# Environment-variable reference

Copy `.env.example` to ignored `.env`; never commit populated secrets. The API validates all values at startup. Production rejects the placeholder institute domain and every `development-only-*` cryptographic key.

## Platform and dependencies

| Variable                  | Default                 | Purpose                                                                          |
| ------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                | `development`           | `development`, `test`, or `production` behavior                                  |
| `API_PORT`                | `3000`                  | NestJS listening port                                                            |
| `PUBLIC_ORIGIN`           | `http://localhost:5173` | Canonical browser origin                                                         |
| `CORS_ALLOWED_ORIGINS`    | local web origin        | Comma-separated exact HTTP(S) origins; wildcard is rejected                      |
| `TRUST_PROXY`             | `false`                 | Trust exactly one configured reverse-proxy hop                                   |
| `DATABASE_ENABLED`        | `true`                  | Connect MongoDB; `false` is only for isolated foundation tests                   |
| `MONGODB_URI`             | local `rs0` URI         | MongoDB replica-set connection string; local Docker uses `directConnection=true` |
| `OPENAPI_ENABLED`         | `true`                  | Serve `/api/docs` and `/api/docs-json`                                           |
| `LOG_LEVEL`               | `log`                   | Structured logger level                                                          |
| `INSTITUTE_EMAIL_DOMAIN`  | placeholder             | Exact allowlisted email domain; real value required in production                |
| `DISPLAY_TIMEZONE`        | `Asia/Kolkata`          | Display timezone; persisted instants remain UTC                                  |
| `OBJECT_STORAGE_PROVIDER` | placeholder             | Deployment inventory label; storage behavior uses variables below                |

## Email

| Variable         | Default                 | Purpose                                                       |
| ---------------- | ----------------------- | ------------------------------------------------------------- |
| `SMTP_HOST`      | `localhost`             | SMTP server; Mailpit locally                                  |
| `SMTP_PORT`      | `1025`                  | SMTP port                                                     |
| `SMTP_SECURE`    | `false`                 | Implicit TLS mode                                             |
| `SMTP_FROM`      | placeholder sender      | Auth-mail sender identity                                     |
| `SMTP_USER`      | empty                   | Optional SMTP username                                        |
| `SMTP_PASSWORD`  | empty                   | Optional SMTP password; secret-manager supplied in production |
| `MAILPIT_UI_URL` | `http://localhost:8025` | Local operator/developer link only                            |

Phase 2 sends OTP mail synchronously with bounded SMTP timeouts. Durable queued email and retry/de-duplication belong to Phase 9. A delivery failure invalidates the challenge while preserving the generic public response.

## OTP and abuse controls

| Variable                       | Default                | Purpose                                                                |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------- |
| `OTP_PEPPER`                   | development-only value | HMAC key for email identifiers and OTP digests; at least 32 characters |
| `OTP_TTL_SECONDS`              | `300`                  | OTP validity, 60–900 seconds                                           |
| `OTP_MAX_VERIFY_ATTEMPTS`      | `5`                    | Failed attempts before challenge lock                                  |
| `OTP_LOCKOUT_SECONDS`          | `900`                  | Email-key lockout after exhausting verification attempts               |
| `OTP_REQUEST_COOLDOWN_SECONDS` | `60`                   | Minimum interval per email/purpose                                     |
| `OTP_RATE_WINDOW_SECONDS`      | `900`                  | Mongo-backed request-count window                                      |
| `OTP_MAX_REQUESTS_PER_EMAIL`   | `5`                    | Email limit per window                                                 |
| `OTP_MAX_REQUESTS_PER_IP`      | `20`                   | HMAC-pseudonymized IP limit per window                                 |

## Sessions, CSRF, and recent authentication

| Variable                          | Default                | Purpose                                                               |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `SESSION_TOKEN_PEPPER`            | development-only value | Key mixed into stored session-token digests; at least 32 characters   |
| `SESSION_COOKIE_NAME`             | `bsbe_session`         | Opaque `HttpOnly` session cookie name                                 |
| `SESSION_IDLE_TTL_SECONDS`        | `3600`                 | Sliding inactivity lifetime                                           |
| `SESSION_ABSOLUTE_TTL_SECONDS`    | `43200`                | Maximum session lifetime; cannot be shorter than idle lifetime        |
| `STUDENT_CONCURRENT_LOGIN_POLICY` | `replace`              | `replace` old session or `reject` new login outside an active attempt |
| `RECENT_AUTH_MAX_AGE_SECONDS`     | `600`                  | Fresh-login/step-up age for sensitive administrator operations        |
| `CSRF_SECRET`                     | development-only value | HMAC key for signed double-submit CSRF tokens; at least 32 characters |
| `CSRF_COOKIE_NAME`                | `bsbe_csrf`            | Non-HttpOnly CSRF cookie name                                         |
| `IP_HASH_KEY`                     | development-only value | Separate HMAC key for pseudonymized IP abuse/audit keys               |

Generate independent production keys using a cryptographically secure secret manager. Do not reuse values. Rotation procedures are documented in [authentication operations](phase-2/authentication-operations.md).

## Question rubrics

| Variable                             | Default          | Purpose                                                       |
| ------------------------------------ | ---------------- | ------------------------------------------------------------- |
| `QUESTION_RUBRIC_KEYS_JSON`          | development key  | JSON map of key-version names to 32-byte base64 AES keys      |
| `QUESTION_RUBRIC_ACTIVE_KEY_VERSION` | `development-v1` | Key version used for newly created immutable question rubrics |

Production rejects the development rubric key. Keep older keys available until all rubric records using them have been re-encrypted. The key ring belongs in a deployment secret manager, not source control.

## Question media

| Variable               | Default     | Purpose                                                |
| ---------------------- | ----------- | ------------------------------------------------------ |
| `MEDIA_STORAGE_DRIVER` | `local`     | `local` for development/test or `s3` for production    |
| `MEDIA_LOCAL_ROOT`     | `var/media` | Private repository-relative development storage root   |
| `MEDIA_MAX_BYTES`      | `5242880`   | Maximum accepted source-image bytes                    |
| `MEDIA_MAX_PIXELS`     | `25000000`  | Decoder pixel ceiling guarding image decompression     |
| `S3_ENDPOINT`          | empty       | Optional S3-compatible endpoint                        |
| `S3_REGION`            | `auto`      | Object-store region                                    |
| `S3_BUCKET`            | empty       | Required private bucket when the S3 driver is selected |
| `S3_ACCESS_KEY_ID`     | empty       | Optional explicit access key; prefer workload identity |
| `S3_SECRET_ACCESS_KEY` | empty       | Secret paired with the explicit access key             |
| `S3_FORCE_PATH_STYLE`  | `true`      | Compatibility switch for provider-neutral S3 endpoints |

Production rejects local media storage. The bucket must block public access; the API writes normalized WebP objects with private/no-store metadata and server-side AES256 storage encryption requested.

## Browser build

| Variable            | Default     | Purpose                         |
| ------------------- | ----------- | ------------------------------- |
| `VITE_APP_NAME`     | portal name | Browser build-time display name |
| `VITE_API_BASE_URL` | `/api/v1`   | Browser build-time API base URL |
