# Delta for Offline Auth Mode — Null Verifier Degrades Gracefully

Extends `openspec/specs/offline-auth-mode/spec.md`. This capability already
owns offline credential verification and error-id mapping. It does not
change the mapping table itself (`OfflineVerifierError` already falls under
"any other offline error" → `AUTH.SERVER_ERROR`) — it adds the missing
scenario that actually exercises a `null` verifier reaching that mapping,
which was previously unreachable because the backend's `Verifier` field was
never nullable (see the `offline-auth` delta in this same change, R5).

## ADDED Requirements

### Requirement: A roster user with a null verifier degrades to OfflineVerifierError, never wrong password

When a roster user's `verifier` field is `null` (a distinct, well-typed
value — not merely absent or malformed), attempting offline login for that
user MUST throw `OfflineVerifierError`, which maps to `AUTH.SERVER_ERROR`
per the existing "Offline error mapping" requirement. It MUST NOT fall
through to `verifyOfflinePassword` and MUST NOT produce
`AUTH.INVALID_CREDENTIALS` ("wrong password").

#### Scenario: Null verifier surfaces offline-unavailable, not wrong-password
- GIVEN a provisioned device whose roster contains a user with `verifier: null`
- WHEN that user submits any password, correct or incorrect
- THEN the form error is `AUTH.SERVER_ERROR`
- AND `AUTH.INVALID_CREDENTIALS` is never shown for this case

#### Scenario: A present, well-typed verifier still distinguishes wrong password normally
- GIVEN a provisioned device whose roster contains a user with a non-null `verifier`
- WHEN that user submits an incorrect password
- THEN the form error is `AUTH.INVALID_CREDENTIALS` (existing behavior, unchanged)

#### Scenario: Type-guard distinguishes null from a stale all-empty verifier
- GIVEN the roster type contract requires `verifier: OfflineVerifier | null` (no longer a
  non-nullable object that could default to `{ hash: "", salt: "", iterations: 0 }`)
- WHEN a user's verifier is `null` on the wire
- THEN the existing `typeof` guard in `offline-auth-service.ts` correctly identifies it as
  missing and throws `OfflineVerifierError` before ever calling `verifyOfflinePassword`
