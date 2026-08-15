# sync-export-import-v2 Specification

## Purpose

v2 backup envelope: an unencrypted `meta.json` entry (formatVersion 2, per-export salt, iterations, storeId, exportedAt) plus 6 data entries encrypted under a WebCrypto PBKDF2-HMAC-SHA-256 key derived from the password ALONE — auth- and store-independent. Import validates the store claim inside `serializer.import` (before any write) and throws a typed `WrongStoreError`. Legacy v1 archives (no `meta.json`) still import via `password + storeId`.

## Requirements

### Requirement: V2-01 Export Envelope

Export MUST produce a ZIP whose `meta.json` entry is unencrypted and contains `formatVersion: 2`, `salt` (base64), `iterations` (100000), `storeId`, and `exportedAt`. The 6 data entries MUST remain AES-encrypted.

#### Scenario: meta.json is present, unencrypted, and complete

- GIVEN a v2 export of store A
- WHEN the ZIP is inspected without a password
- THEN `meta.json` reads as plaintext with `formatVersion: 2`, the exporting `storeId`, `iterations: 100000`, a base64 `salt`, and an ISO `exportedAt`

#### Scenario: Data entries stay encrypted

- GIVEN a v2 export
- WHEN the ZIP is opened without any password
- THEN `meta.json` is readable but the 6 data entries are not

### Requirement: V2-02 Salt Randomness

Export MUST generate a fresh 16-byte salt per export using WebCrypto `getRandomValues`, base64-encoded into `meta.json`.

#### Scenario: Two exports of the same store differ in salt

- GIVEN two v2 exports of store A produced in sequence
- WHEN their `meta.json` entries are compared
- THEN their `salt` values differ and each decodes to 16 bytes

### Requirement: V2-03 Key Derivation — Password Only

The 32-byte encryption key MUST be derived via WebCrypto PBKDF2-HMAC-SHA-256 from the user-supplied password ALONE, using the exported salt and the `iterations` value read from `meta.json` (upgradable, not hardcoded). The key MUST NOT depend on storeId, auth identity, or any DEK.

#### Scenario: Same password derives the same key for any user of the store

- GIVEN a v2 export of store A with salt S and iterations 100000
- WHEN a different user of store A on a fresh device derives the key with the same password
- THEN the derived key is 32 bytes and identical to the exporter's key, regardless of auth mode

#### Scenario: Iterations are honored from meta.json

- GIVEN a v2 export whose `meta.json` declares `iterations: 50000`
- WHEN the import derives the key
- THEN PBKDF2 runs with 50000 iterations, not a fixed value

### Requirement: V2-04 Per-Entry rawPassword Encryption

The 6 data entries MUST each be encrypted by passing the derived 32-byte key as the zip.js per-entry `rawPassword: Uint8Array`. `meta.json` MUST NOT be encrypted and MUST NOT contain the password or derived key. zip.js's internal PBKDF2-SHA-1 @ 1000-iteration KDF still runs over the rawPassword — it is buried, not replaced; the outer WebCrypto KDF dominates.

#### Scenario: Six encrypted entries plus plaintext meta

- GIVEN a v2 export
- WHEN the ZIP entries are enumerated
- THEN exactly the 6 data entries are password-protected and `meta.json` is not

#### Scenario: No key material in meta.json

- GIVEN a v2 export's `meta.json`
- WHEN its contents are inspected
- THEN it contains no password, no derived key, and no DEK material

### Requirement: V2-05 Store Claim → WrongStoreError

v2 import MUST validate `meta.storeId === current storeId` inside `serializer.import` — before any repository/service write — and on mismatch MUST throw a typed `WrongStoreError`, distinct from `WrongPasswordError`.

#### Scenario: Same store import proceeds

- GIVEN a v2 export of store A imported with `selectedStoreId` A and the correct password
- WHEN import runs
- THEN no `WrongStoreError` is thrown and the data merges

#### Scenario: Different store throws WrongStoreError before any write

- GIVEN a v2 export of store A imported with `selectedStoreId` B and the correct password
- WHEN import runs
- THEN a typed `WrongStoreError` is thrown, not `WrongPasswordError`, and store B data is untouched

### Requirement: V2-06 Wrong Password → WrongPasswordError

v2 import with an incorrect password MUST throw `WrongPasswordError`, with semantics unchanged from v1.

#### Scenario: Wrong password with a matching store

- GIVEN a v2 export of store A imported with `selectedStoreId` A and a wrong password
- WHEN import runs
- THEN `WrongPasswordError` is thrown

### Requirement: V2-07 v1 Legacy Fallback Import

When the ZIP has no `meta.json`, import MUST fall back to the v1 path: password combined as `password + storeId` via zip.js's internal derivation. Legacy Angular/React v1 archives MUST import with v1 `WrongPasswordError` semantics.

#### Scenario: Legacy archive imports via the v1 path

- GIVEN a v1 ZIP without `meta.json` exported from store A
- WHEN importing with the correct password while `selectedStoreId` is A
- THEN the v1 path decrypts and all 6 entity files merge

#### Scenario: Legacy wrong password keeps v1 semantics

- GIVEN a v1 ZIP without `meta.json`
- WHEN importing with a wrong password
- THEN `WrongPasswordError` is thrown as in v1

### Requirement: V2-08 Two-Device Round-Trip E2E

A NEW Playwright spec MUST cover device A export → device B import: device B is a fresh browser context with the same storeId and imports the downloaded file with the SAME password only. The spec MUST seed via zero-login `plantRoster` (NEVER `signedInPage` persona minting — the suite sits at the 5-login/min ceiling) and MUST NOT add a real login.

#### Scenario: Fresh device imports with the password only

- GIVEN device A (plantRoster, storeId X) exports a backup with password P, and device B is a fresh context with storeId X and no prior session
- WHEN device B imports the downloaded file with P
- THEN the exported data is present in device B

#### Scenario: The E2E mints zero logins

- GIVEN the new spec runs in the shared suite
- WHEN its fixtures are exercised
- THEN it uses `plantRoster` only, so no 6th login is minted and the 5/min ceiling holds

### Requirement: V2-09 No-Write-in-Import Invariant

Import MUST NOT write to storage before validation and decryption complete; the invariant MUST hold on the `WrongStoreError` path too.

#### Scenario: WrongStoreError path writes nothing

- GIVEN a v2 export of store A imported under storeId B
- WHEN import throws `WrongStoreError`
- THEN no entity write occurred (import-no-write test covers this path)

#### Scenario: Successful import writes only after decrypt

- GIVEN a valid v2 archive
- WHEN import runs
- THEN all writes occur through the synchronizer repository seams after decrypt completes

### Requirement: V2-10 i18n Wrong-Store Message

The UI MUST surface `WrongStoreError` via the existing blocking-error pattern using the new i18n key `SYNC.ERROR_WRONG_STORE`, distinct from the wrong-password message.

#### Scenario: Wrong-store error shows the dedicated translation

- GIVEN an import that throws `WrongStoreError`
- WHEN the import form renders the result
- THEN a blocking error shows `SYNC.ERROR_WRONG_STORE`, not the wrong-password text

### Requirement: V2-11 Empty-Store Export/Import

An export of a store with no data MUST produce a valid v2 ZIP with empty payloads, and importing it MUST succeed without writing data.

#### Scenario: Empty-store round-trip

- GIVEN store A has no products/categories/inventory/orders/expenses/sale-credits
- WHEN it is exported and the archive is imported
- THEN the archive is valid (meta.json + 6 encrypted empty entries) and the import succeeds

### Requirement: V2-12 Corrupt File → CorruptFileError

A non-ZIP file or a corrupt ZIP MUST throw the existing `CorruptFileError` on import, unchanged from v1.

#### Scenario: Non-ZIP input rejected

- GIVEN a file that is not a valid ZIP
- WHEN import runs
- THEN `CorruptFileError` is thrown

#### Scenario: Corrupt ZIP behaves with v1 parity

- GIVEN a ZIP whose central directory is intact but whose data entries are corrupt
- WHEN import runs
- THEN `WrongPasswordError` is thrown — byte-identical to the v1 fallback mapping (zip.js conflates wrong-password and corrupt-stream at `getData`), unchanged from v1
- AND a structurally corrupt ZIP (corrupt central directory or local headers) throws `CorruptFileError`, unchanged from v1

## Non-Goals

- No DEK / `enc:v1:` / entity-crypto changes — export stays decrypted at the getItem boundary (repositories already decrypt).
- React v2 exports are NOT importable by the Angular v1 reader — documented limitation; v1 fallback keeps Angular→React and old-backup reads. No dual-export UI.
- No roster-domain changes (`roster-serializer.ts` `WrongPasswordError` untouched).
- No auth-mode coupling; Angular legacy stays a v1 writer (parity source `data-serializer.service.ts:25,57`).

## Test Impact (v1 tests → expected behavior)

- `data-serializer-service.test.ts`: the ~12 `readRawEntries(PASSWORD + STORE_ID)` sites (lines 336–579) MUST switch to password-only derivation for v2 cases; v1-fallback cases keep `password + storeId`.
- T2 'produces exactly the 6 Angular-named entries': 6 data entries persist; v2 adds an unencrypted `meta.json` entry, so 'each entry is reported as encrypted' MUST exclude `meta.json`.
- T3 derivation block: replace concat-derivation pin with PBKDF2-SHA-256 (iterations from meta, 32-byte key) for v2; keep the concat pin for the v1 fallback path.
- T4 wrong-store: becomes `WrongStoreError` (correct password decrypts, store claim fails) — distinct from wrong-password.
- T5/T6 round-trips: unchanged except the v1-reader call (line 579) moves to the v1-fallback path.
- `import-no-write.test.ts`: ADD a `WrongStoreError` case asserting no writes.
- `import-form.test.tsx`: ADD `WrongStoreError` → `SYNC.ERROR_WRONG_STORE` surfacing.
