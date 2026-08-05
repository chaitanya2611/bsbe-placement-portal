# Phase 3 completion report: question bank and media

Phase 3 implements administrator question authoring and stops before Phase 4 exam assembly. Questions are immutable, versioned content records. Correct answers live in a separate collection encrypted with AES-256-GCM; ordinary question serializers never contain them.

## Delivered

- Single-choice, exact-set multiple-select, true/false, and numerical questions with exact, absolute, or relative tolerance.
- Prompt, option, mark, negative-mark, difficulty, tag, explanation, media, numerical-display, and chemical-structure validation through shared Zod contracts.
- An immutable `QuestionVersion` for every edit, optimistic concurrency using `expectedVersion`, independent cloning, draft/active/archive states, search/filtering, and version/usage history.
- Separate `QuestionRubric` records encrypted with a versioned 256-bit AES-GCM key. Decryption is limited to a permission-protected, recent-authentication administrator route and is audited.
- Private local or S3-compatible media storage. Uploads are decoded, pixel/byte bounded, reduced to one frame, rotated/resized, metadata-stripped, normalized to WebP, hash-deduplicated, and served with private/no-store and nosniff headers.
- SMILES and MOL/SDF-block validation with OpenChemLib, plus sanitized browser depiction. KaTeX uses untrusted mode and sanitized output.
- Administrator UI for create, preview, edit-as-new-version, search/filter, clone, archive/restore, image upload, equation preview, and chemical depiction.
- Migration `003-question-bank-media-indexes`, security unit tests, Docker-gated real lifecycle integration coverage, and a Phase 3 boundary validator.

## API map

All routes require an authenticated administrator. Mutations also require CSRF; sensitive mutations and rubric reveal require recent authentication.

| Method | Route                                 | Purpose                                      |
| ------ | ------------------------------------- | -------------------------------------------- |
| GET    | `/api/v1/admin/questions`             | Search/filter question summaries             |
| POST   | `/api/v1/admin/questions`             | Create draft and immutable version 1         |
| GET    | `/api/v1/admin/questions/:id`         | Read current answer-free version             |
| PUT    | `/api/v1/admin/questions/:id`         | Create next version with optimistic locking  |
| POST   | `/api/v1/admin/questions/:id/clone`   | Create an independent draft clone            |
| PATCH  | `/api/v1/admin/questions/:id/status`  | Draft, activate, or archive with reason      |
| GET    | `/api/v1/admin/questions/:id/history` | Read immutable version and usage history     |
| GET    | `/api/v1/admin/questions/:id/rubric`  | Audited, recent-auth protected answer reveal |
| GET    | `/api/v1/admin/media`                 | List normalized private media                |
| POST   | `/api/v1/admin/media`                 | Validate and upload one image                |
| GET    | `/api/v1/admin/media/:id/content`     | Stream private preview content               |
| DELETE | `/api/v1/admin/media/:id`             | Delete only when never referenced            |

## Setup and migrations

PowerShell:

```powershell
Set-Location 'C:\Users\Admin\Documents\Exam Portal'
Copy-Item -LiteralPath '.env.example' -Destination '.env'
pnpm install --frozen-lockfile
docker compose up -d --wait mongo mongo-init mailpit
pnpm migrate
pnpm dev
```

Bash:

```bash
cd '/path/to/Exam Portal'
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d --wait mongo mongo-init mailpit
pnpm migrate
pnpm dev
```

For production, put an independent 32-byte base64 key in `QUESTION_RUBRIC_KEYS_JSON`, set its version in `QUESTION_RUBRIC_ACTIVE_KEY_VERSION`, and use `MEDIA_STORAGE_DRIVER=s3`. Do not delete old rubric keys while any record references them. Rotation means adding a key version and making it active; background re-encryption can be added later without changing question versions.

## Verification

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:phase3
```

Real lifecycle test (requires Docker MongoDB and Mailpit):

```powershell
docker compose up -d --wait mongo mongo-init mailpit
$env:RUN_QUESTION_INTEGRATION = 'true'
node --test .\tests\question-bank.integration.test.mjs
Remove-Item Env:\RUN_QUESTION_INTEGRATION
```

```bash
docker compose up -d --wait mongo mongo-init mailpit
RUN_QUESTION_INTEGRATION=true node --test ./tests/question-bank.integration.test.mjs
```

The integration test verifies real transactions and indexes, authenticated media decode/normalization, answer-free responses, encrypted rubric separation, rejected invalid answers, immutable version retention, optimistic-lock conflicts, search, clone, archive, rubric audit, and media reference protection.

## Known boundaries and risks

- Media previews are administrator-only in this phase. Phase 4/5 must expose attempt-authorized media without broadening question-bank access.
- S3-compatible storage is implemented but requires provider credentials and deployment-level lifecycle/backups to be tested in the chosen environment.
- Virus scanning is not a substitute for strict image decoding; an optional asynchronous scanner can be added for institutional policy. Files are already re-encoded rather than served verbatim.
- Question usage history is indexed and readable, but Phase 4 owns writing usage links when immutable exam versions are published.
- Browser chunks for chemistry remain relatively large and are lazy-loaded only when a chemical preview is present.
- This remains unsuitable for a real exam: exam authorization, attempts, autosave, timer authority, lockdown, grading, and result release are later phases.

## Exit checklist

- [x] Every required objective question type is modeled and validated.
- [x] Multiple-select answers use exact-set semantics in the rubric contract.
- [x] Numerical tolerances distinguish exact, absolute, and relative modes.
- [x] Question edits create immutable versions and reject stale writers.
- [x] Correct answers are absent from safe serializers and encrypted separately.
- [x] Media is private, decoded, bounded, normalized, and protected from deletion while referenced.
- [x] Equation and chemical rendering use constrained parsers and sanitization.
- [x] Search, filter, preview, clone, archive/restore, and history are implemented.
- [x] Security unit tests and CI integration coverage are present.
- [x] Phase 4 exam creation has not been started.

Stop here. Phase 4 begins only after the explicit instruction `Continue to Phase 4`.
