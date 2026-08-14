# Delta for sync

> Requirement ids: SYNC-01 = Angular-Compatible Backup Format · SYNC-02 = Store-Scoped Backup Decryption. New v2 behavior lives in the `sync-export-import-v2` capability spec (V2-01…V2-12).

## MODIFIED Requirements

### Requirement: Angular-Compatible Backup Format

(SYNC-01 — Previously: export produced exactly the 6 Angular-named entries, byte-for-byte, with no envelope entry; React-exported archives imported into Angular.)

Export MUST produce a ZIP containing 6 password-protected AES JSON files (`products.json`, `categories.json`, `inventory-entries.json`, `orders.json`, `expenses.json`, `sale-credits.json`) matching Angular's `data-serializer.service.ts` entry names, plus an unencrypted `meta.json` envelope entry (`{ formatVersion: 2, salt, iterations, storeId, exportedAt }`) for v2 exports. Angular-exported archives (no `meta.json`) MUST still import into React via the v1 fallback path. React v2 exports are NOT importable by the Angular v1 reader — a documented limitation; there is no dual-export UI.

#### Scenario: Angular-exported backup imports into React

- GIVEN a `.zip` backup exported by the Angular app with a known password
- WHEN a React user imports it with the same password and matching store context
- THEN the v1 fallback path decrypts and all 6 entity files merge

#### Scenario: React v2 export is a superset with meta.json

- GIVEN a React v2 export
- WHEN the ZIP is inspected
- THEN it contains the 6 Angular-named encrypted entries plus an unencrypted `meta.json` (formatVersion 2)

#### Scenario: React v2 export is not importable by Angular (documented limitation)

- GIVEN a React v2 export and the Angular v1 reader
- WHEN the Angular app attempts to import it
- THEN decryption of the data entries fails (no v2 support) and the limitation is documented; no dual-export UI exists

### Requirement: Store-Scoped Backup Decryption

(SYNC-02 — Previously: the decryption password was derived by concatenating the user-supplied password with the exporting session's `selectedStoreId`; a wrong-store import failed as a wrong-password/corrupt-file error.)

For v2 exports the encryption key MUST be derived from the user-supplied password ALONE via WebCrypto PBKDF2-HMAC-SHA-256 (32-byte key, iterations read from `meta.json`) and passed as the zip.js per-entry `rawPassword`. Store scoping MUST be enforced by validating `meta.storeId === selectedStoreId` inside `serializer.import` — before any write — throwing the typed `WrongStoreError` (distinct from `WrongPasswordError`) on mismatch. For legacy archives without `meta.json`, the v1 rule applies: the password is combined with the exporting session's `selectedStoreId` (`password + storeId`), preserving v1 `WrongPasswordError` semantics.

#### Scenario: Same store, correct password succeeds

- GIVEN a v2 backup exported while `selectedStoreId=A`
- WHEN importing with the correct password while `selectedStoreId=A`
- THEN decryption succeeds

#### Scenario: Different store, correct password throws WrongStoreError

- GIVEN a v2 backup exported while `selectedStoreId=A`
- WHEN importing with the same password while `selectedStoreId=B`
- THEN the store claim fails and import throws the typed `WrongStoreError` before any write — no longer a wrong-password/corrupt-file error

#### Scenario: Legacy v1 archive stays store-bound

- GIVEN a v1 archive (no `meta.json`) exported while `selectedStoreId=A`
- WHEN importing with the correct password while `selectedStoreId=A`
- THEN v1 decryption succeeds; while `selectedStoreId=B` it fails with `WrongPasswordError` as before

#### Scenario: v2 key is auth-independent on a fresh device

- GIVEN a v2 export of store A
- WHEN a different user of store A on a fresh device imports with only the password
- THEN derivation and import succeed without any auth identity
