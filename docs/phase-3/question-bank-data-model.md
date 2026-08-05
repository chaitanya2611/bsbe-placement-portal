# Phase 3 question-bank data model

## Collections

`questions` is the mutable catalog pointer and search projection. It stores the public ID, current version reference/number, workflow status, question type, prompt summary, normalized search text, difficulty, tags, marks, and creator/updater references.

`questionversions` is immutable content. It stores prompt, options, marks, tags, explanation, media references, chemical source, numerical display data, author, and creation time. The unique `(questionId, versionNumber)` index prevents duplicate version races.

`questionrubrics` is the separate answer boundary. One rubric is uniquely linked to one question version and stores only key version, algorithm, IV, ciphertext, and authentication tag. Cryptographic fields are excluded from ordinary Mongoose selections.

`mediaassets` stores private object metadata and the normalized WebP dimensions/hash. Storage keys and hashes are excluded from ordinary selections. Binary content is stored below an application-private local root in development or in an S3-compatible private bucket.

`questionusages` is an append-only bridge reserved for Phase 4 exam publication. Its unique `(questionVersionId, examVersionPublicId)` index makes history idempotent and ensures an exam points to an exact immutable question version.

## Integrity rules

- A catalog row points to exactly one current immutable version.
- A version owns exactly one encrypted rubric.
- Question creation/update, rubric creation, catalog-pointer update, and the associated audit event share one MongoDB transaction.
- Editors submit `expectedVersion`; a concurrent change returns HTTP 409.
- Archived questions remain addressable for history and any future published exam references.
- Referenced media cannot be deleted, including references from historical versions.
- Correct answers never appear in `Question`, `QuestionVersion`, `SafeQuestionVersion`, search projections, logs, or media metadata.

## Encryption record

Rubrics use AES-256-GCM with a fresh 96-bit IV. Additional authenticated data is `question-rubric:<questionVersionObjectId>`, so ciphertext cannot be moved to another version. The record carries a non-secret key version; key material comes only from validated runtime configuration. GCM authentication failure is fatal and no plaintext is returned.

## Indexes

- Unique public IDs for question, version, and media.
- Unique question/version number.
- Unique rubric per version.
- Compound workflow/type/difficulty/update filter index.
- Tag/status and text-search indexes.
- Media hash/status deduplication and administrative-list indexes.
- Question usage history and unique exam-version usage indexes.

Migration `003-question-bank-media-indexes` creates these indexes and records completion in the existing append-only migration collection.
