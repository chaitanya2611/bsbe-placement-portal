# Security policy

## Current status

The repository is at Phase 3 and is not yet approved for real examinations. Identity controls plus versioned question content, separately encrypted correct-answer rubrics, private normalized media, and audited administrator operations are implemented. Exam authorization, answer reliability, lockdown, scoring, and result controls remain future phases.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, student information, examination content, or unpublished answers. Report privately to the department's designated security contact: `<security-contact>`.

Include affected version/commit, reproducible steps using fictional data, impact, and suggested mitigation if known. Do not access another person's data, disrupt an examination, or retain sensitive material while testing.

## Secrets

- Never commit `.env`, OTPs, session tokens, exam passwords, correct answers, production URLs with credentials, cloud keys, or SMTP credentials.
- Rotate exposed credentials immediately and preserve safe incident evidence.
- `.env.example` contains placeholders only.
- Production startup rejects development cryptographic keys. Supply independent high-entropy values for `OTP_PEPPER`, `SESSION_TOKEN_PEPPER`, `CSRF_SECRET`, and `IP_HASH_KEY` through the deployment secret manager.
- Rotate a session pepper by invalidating all sessions. Rotate an OTP pepper after allowing existing OTP challenges to expire. A CSRF-key rotation invalidates outstanding CSRF tokens. Keep the IP hashing key separate.
- Keep rubric keys in a secret manager. Add a new version before making it active, retain every version still referenced by a rubric record, and never place plaintext answers or key material in logs, backups outside the encrypted backup boundary, or browser configuration.

## Phase 2 authentication controls

- Public OTP request responses do not reveal account existence, state, role, or delivery outcome.
- OTP plaintext exists only in process memory during SMTP handoff; MongoDB stores a keyed digest and audit logs never receive the code.
- Session cookies are opaque and `HttpOnly`, use `SameSite=Lax`, and become `Secure` in production. MongoDB stores only a peppered digest.
- Every browser mutation requires a valid signed double-submit token, matching cookie/header values, and an exact allowed Origin.
- Protected endpoints are authenticated by a global guard. Permission and recent-authentication guards fail closed.
- A partial unique MongoDB index is the final concurrency backstop for one active session per student.
- Deactivation increments the user security revision and revokes active sessions.

The full design threat model is [docs/phase-0/03-threat-model.md](docs/phase-0/03-threat-model.md).

## Phase 3 question confidentiality controls

- Safe question contracts and serializers contain no answer/rubric property. Answers exist only in a separate encrypted collection.
- AES-256-GCM uses a fresh IV and question-version-bound authenticated data. Tampering or copying ciphertext to another version fails authentication.
- Rubric reveal requires explicit permission plus recent authentication and creates an audit record.
- Media accepts only decoded JPEG/PNG/WebP input, enforces byte/pixel/frame limits, normalizes to metadata-free WebP, and is served privately with `no-store` and `nosniff`.
- Chemical structures are parsed and atom-bounded. Browser chemical SVG and KaTeX output are sanitized; KaTeX trust is disabled.
- Immutable version and unique rubric/usage indexes preserve historical integrity. Referenced media cannot be removed.
