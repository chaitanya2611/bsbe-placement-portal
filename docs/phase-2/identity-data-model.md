# Phase 2 identity data model and index plan

All externally returned identifiers are UUIDs in `publicId`; MongoDB `_id` values remain internal. Schemas use `strict: "throw"`, bounded strings, timestamps, and explicit indexes. Production runs the `002-identity-access-indexes` migration because automatic index creation is disabled there.

```mermaid
erDiagram
  PROGRAM ||--o{ USER : "assigned to student"
  USER ||--o{ OTP_CHALLENGE : requests
  USER ||--o{ SESSION : authenticates
  USER ||--o{ AUDIT_EVENT : acts

  PROGRAM {
    uuid publicId UK
    string code UK
    string name
    boolean active
  }
  USER {
    uuid publicId UK
    string email UK
    string rollNumber UK_optional_student
    string role
    string status
    int securityRevision
  }
  OTP_CHALLENGE {
    uuid publicId UK
    string emailKey
    string ipKey
    string otpHash
    int verifyAttempts
    datetime expiresAt
    datetime deleteAt TTL
  }
  SESSION {
    uuid publicId UK
    string tokenHash UK
    uuid deviceSessionId
    boolean active
    datetime expiresAt TTL
  }
  AUDIT_EVENT {
    uuid publicId UK
    string eventType
    string outcome
    datetime occurredAt
  }
```

## Collections and indexes

| Collection          | Important indexes                                                                                        | Retention                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `programs`          | unique public ID; unique canonical code                                                                  | retained                                                    |
| `users`             | unique public ID; unique canonical email; partial unique student roll; role/status/name list index       | retained                                                    |
| `otpchallenges`     | unique public ID; TTL cleanup; email/purpose/time and IP/time abuse indexes                              | retained through the longest rate/lock window, then removed |
| `sessions`          | unique public ID and token digest; TTL expiry; user/active lookup; partial unique active student session | automatically removed after expiry                          |
| `auditevents`       | unique public ID; event timeline; actor timeline; target timeline                                        | retained; no TTL                                            |
| `portal_migrations` | unique migration ID                                                                                      | retained                                                    |

The TTL monitor is cleanup, not correctness. Every OTP/session lookup explicitly checks expiry and state. The partial unique session index is the final concurrent-login race backstop. `activeAttemptId` is reserved for the Phase 5 attempt binding; if present, Phase 2 already rejects device replacement.

## Stored-secret boundaries

- OTP code: HMAC digest of purpose-bound challenge ID and code; field is excluded from normal queries.
- Session token: SHA-256 digest mixed with an independent server pepper; field is excluded from normal queries.
- Email/IP abuse keys: HMAC pseudonyms. Email remains on the pre-provisioned user record because it is required for delivery and administration.
- Audit metadata is constructed by server code and cannot contain OTPs, session tokens, request bodies, or future correct answers.
