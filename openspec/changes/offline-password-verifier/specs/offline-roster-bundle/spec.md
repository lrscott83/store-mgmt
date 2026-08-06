# Delta for offline-roster-bundle — Nullable Verifier & Genuine Cross-Stack KAT Vector

Extends `openspec/specs/offline-roster-bundle/spec.md`. This capability
already owns the bundle schema and verifier/wrap known-answer vectors
(`Requirement: Verifier parameters are pinned by known-answer vectors`,
`:13-18`) — that requirement's pre-hash convention was already correct and
is unchanged. This delta (a) widens the bundle schema to accept a null
verifier, and (b) replaces the frontend's self-labelled placeholder DEK-wrap
KAT fixture with the genuine backend-produced vector, closing the
"no cross-stack vector has ever existed" gap the exploration found.

## MODIFIED Requirements

### Requirement: Bundle carries optional per-user wrap fields; formatVersion stays a plain number

`OfflineRosterUser.verifier` MUST be typed `OfflineVerifier | null`, not the
non-nullable `OfflineVerifier` it is today. Shape validation MUST continue
to accept `wrappedDek`/`wrapSalt`/`wrapIv` absent or empty on any bundle,
and MUST additionally accept `verifier: null` on a `formatVersion: 3`
bundle for a user with no server-side pre-hash yet.

#### Scenario: v3 bundle with a null verifier is a valid shape
- GIVEN a stored bundle with `formatVersion: 3` and one user whose `verifier` is `null`
- WHEN the bundle shape is validated
- THEN it is accepted as valid, and `verifier` remains `null` (not coerced to an empty object)

#### Scenario: v3 bundle with a populated verifier is still valid
- GIVEN a stored bundle with `formatVersion: 3` and every user carrying a non-null `verifier`
- WHEN the bundle shape is validated
- THEN it is accepted as valid, exactly as before this change

## ADDED Requirements

### Requirement: Genuine cross-stack DEK-wrap known-answer vector (replaces the placeholder)

The frontend KAT fixture consumed by `dek-unwrap.kat.test.ts`
(`__tests__/__fixtures__/dek-kat.json`) MUST be replaced with the literal
field values committed in `docs/contracts/offline-roster-dek-kat.json`
(provenance `dotnet-backend`) — it MUST NOT remain a `node-transcription`
placeholder that only proves the frontend's math is self-consistent. Both
`dek-unwrap.kat.test.ts` (frontend) and `StoreKeyWrapInteropTests` (backend,
`offline-auth` R18) MUST read their respective copy of the same committed
values. Each side MUST additionally, independently, assert that the
vector's persisted pre-hash field equals `Base64(SHA256(UTF8(vector.password)))`
computed by that stack's own primitives — a permanent, cross-stack guard
against the exact class of drift (backend and frontend agreeing on a wire
format but disagreeing on what feeds it) that caused this defect.

#### Scenario: Frontend KAT test unwraps the shared vector
- GIVEN the committed vector's `wrapSalt`, `wrapIv`, `wrappedDek`, `iterations`, and pre-hash field
- WHEN `unwrapDek` derives the KEK from the vector's pre-hash and decrypts `wrappedDek`
- THEN the recovered bytes equal the vector's `expectedDek` byte for byte

#### Scenario: Frontend independently verifies the pre-hash formula
- GIVEN the committed vector's `password` and pre-hash field
- WHEN the frontend computes `sha256Base64(vector.password)`
- THEN it equals the vector's pre-hash field exactly

#### Scenario: Backend independently verifies the same formula
- GIVEN the same committed vector, read on the backend side
- WHEN the backend computes `Base64(SHA256(UTF8(vector.password)))`
- THEN it equals the vector's pre-hash field exactly (cross-referenced with `offline-auth` R18's
  equivalent assertion — the same claim proven twice, once per stack, from the same file)

#### Scenario: A frontend-only regression in sha256Base64 fails this test without a live backend
- GIVEN a hypothetical change to `sha256Base64`'s encoding or digest step
- WHEN the KAT test runs
- THEN it fails locally, with no backend or network dependency required to catch the regression
