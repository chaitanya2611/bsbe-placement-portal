# Safe Exam Browser integration design

## Scope and source of truth

Safe Exam Browser (SEB) is required for primary secure-exam mode. Implementation must be verified against the current official SEB developer documentation at the time it is built. This design relies on the documented Browser Exam Key and Config Key request hashes; it does not trust a user-agent string and does not invent headers.

Official references reviewed for this design:

- [SEB Config Key developer documentation](https://safeexambrowser.org/developer/seb-config-key.html)
- [SEB Browser Exam Key specification](https://safeexambrowser.org/developer/documents/SEB-Specification-BrowserExamKey.pdf)
- [SEB Windows manual](https://safeexambrowser.org/windows/win_usermanual_en.html)
- [SEB Server project](https://github.com/SafeExamBrowser/seb-server)

The OWASP baseline is [ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) Level 2. References are design inputs, not vendored dependencies.

## Documented validation mechanisms

When enabled, SEB sends request hashes tied to the requested URL:

- `X-SafeExamBrowser-RequestHash` for Browser Exam Key validation.
- `X-SafeExamBrowser-ConfigKeyHash` for Config Key validation.

The official algorithms combine the exact requested URL with the expected key in their documented order and hash using SHA-256. The Config Key documentation specifies URL first, then the Base16-encoded Config Key hash. The Browser Exam Key specification must be followed exactly for its ordering/representation. Phase 6 implementation will use official test vectors or cross-check against the current SEB Config Tool; this Phase 0 document deliberately avoids hand-waving byte encodings.

Properties:

- Browser Exam Key depends on SEB application/version/platform properties and configuration, so multiple allowlisted values may be needed for approved client builds.
- Config Key identifies the configuration and is designed to remain consistent across compatible supported platforms/SEB updates when settings are identical.
- The per-request URL hash keeps the underlying key out of the header. Expected key material is still sensitive and stored encrypted with access/audit controls.
- Header presence alone proves nothing; the server calculates an expected hash and uses constant-time comparison.

## Canonical URL problem

Validation depends on the URL SEB used. A reverse proxy can change scheme, host, port, or path. Production must:

1. Publish one canonical HTTPS origin and exam URL.
2. Configure SEB start/allowed URLs to that origin.
3. Trust forwarded scheme/host only from the allowlisted proxy.
4. Reconstruct the external absolute URL using a single reviewed function, preserving the exact path/query rules required by SEB documentation.
5. Reject ambiguous/multiple forwarded headers, unapproved hosts, non-HTTPS origins, and encoded-path ambiguity before key validation.
6. Test hashes end-to-end through the real proxy/CDN for every supported OS/client/config.

Do not accept alternative URL candidates until one happens to match; that weakens host/path binding.

## Exam configuration workflow

1. Administrator completes the exam and its canonical URLs/resources.
2. The system exports or an administrator creates an exam-specific `.seb` configuration using the current SEB Config Tool/SEB Server.
3. Configuration limits navigation to the portal origin and explicitly necessary asset/object origins; blocks unauthorized applications/sites according to supported settings; disables unsafe downloads/printing/clipboard as appropriate; uses kiosk mode; and defines restart/quit behavior.
4. Use encrypted configuration and configuration signing/embedded certificate identity where the current supported SEB platform/tooling provides it. Private signing keys remain outside the app repository.
5. After final save, record configuration checksum, Config Key, allowlisted Browser Exam Keys by supported client/platform version, tool/version, created/approved actors, and validity/revocation status. Key fields are encrypted and separately permissioned.
6. Validate the configuration against staging through the real reverse proxy and run the mock system-check exam.
7. Publish a download/launch link only to eligible authenticated candidates at the approved time. The file itself contains no exam password or user session token.
8. Any setting or allowed URL change creates a new configuration version and new approval/testing. Revoke the old version according to exam rollout state.

## Request enforcement

For `lockdownRequired=true`, enforce valid SEB evidence at:

- attempt authorization and start;
- every attempt/question/answer/sync/heartbeat/section/submission endpoint where SEB sends the keys;
- authenticated exam page/API navigation as feasible under documented client behavior.

A valid session that later lacks/mismatches SEB evidence cannot silently fall back. Deny the operation, record a safe `LOCKDOWN_VERIFICATION_FAILED` event, and direct the candidate to controlled recovery. Rate-limit failure logging to prevent log flooding.

The exam policy declares whether Config Key alone, Browser Exam Key alone, or both are required. Recommended secure production policy is Config Key plus an allowlisted Browser Exam Key for each approved SEB build, subject to cross-platform operational testing.

## Launch and safe exit

- The `.seb` start URL leads to an authenticated launch/compatibility route, then the authorized exam. The configuration contains only allowed origins/resources.
- The portal never treats possession of the `.seb` file as authentication; OTP/session/password/eligibility still apply.
- Successful terminal submission returns a server-signed/opaque receipt and only then enables/navigates to the configured SEB quit URL/process.
- The quit password/exit mechanism is controlled by the exam operator and not embedded in ordinary web payloads. Emergency exit and crash recovery instructions are documented for proctors.
- A candidate who closes SEB before submission resumes only through the same bound session/device policy or an audited recovery.

## Compatibility and mock examination

The pre-exam tool checks, without invasive fingerprinting:

- supported desktop OS and current approved SEB version;
- correct Config/Browser Exam Key validation through production-like proxy;
- TLS/certificate/DNS, cookies, session/CSRF, WebSocket only if later used, API latency, and clock offset display;
- fullscreen/kiosk launch, permitted URLs/media, KaTeX, image/chemical rendering, keyboard/accessibility accommodations;
- IndexedDB availability/quota, answer save/reload/reconnect, section transition, and safe submission/exit;
- no production exam content or correct answers.

Results are time-limited compatibility evidence, not permanent device trust. A short mock system-check exam should be mandatory before the first secure examination and after material client/config changes.

## Standard-browser fallback

Allowed only for practice/development/testing or an exam-specific administrator grant with candidate, reason, issuer, time window, and audit. The UI prominently labels it lower security.

Controls: fullscreen request/exit monitoring, visibility/blur monitoring, copy/paste/print/context-menu/shortcut deterrence, print CSS hiding exam content, repeated moving watermark with name/roll/attempt fragment/current time, and rate-limited integrity events. These controls do **not** reliably prevent screenshots, task switching, OS tools, extensions, virtual machines, second devices, or collusion. Events require human context and are not automatic proof of cheating.

## Privacy position

SEB screen proctoring is not part of this project. The portal does not capture webcam, microphone, biometrics, hidden recordings, or invasive device fingerprints. If institutional policy later proposes screen proctoring, it requires a separate privacy/threat/legal assessment and explicit scope change.

## Phase 6 proof requirements

- Current official SEB documentation/version compatibility recorded.
- Exact hash implementation covered by official/cross-tool vectors and negative tests.
- End-to-end reverse-proxy tests for every supported OS/client/config.
- Modified config, wrong client version, missing/duplicate header, wrong host/path/query, proxy spoof, and fallback misuse rejected.
- Config export/signing/key rotation/revocation and emergency exit runbooks tested.
- Student/admin setup guide and mock exam completed with fictional data.
