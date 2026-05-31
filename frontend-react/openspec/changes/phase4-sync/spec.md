# Spec: phase4-sync — Synchronization (Export / Import)

**Change:** phase4-sync
**Phase:** Spec
**Status:** Active (REVISED — Angular interop dropped, uniform serialization + WebCrypto AES-GCM)
**Date:** 2026-05-31

---

## Scope Statement

After phase4-sync is applied the following MUST be true:

1. Two new routes are registered, feature-gated, and reachable: `/sync/export` (EFeatures.Send=40) and `/sync/import` (EFeatures.Receive=42).
2. `DataSerializerService` builds a `fflate`-zipped payload encrypted with browser-native WebCrypto AES-GCM (PBKDF2 key derivation). File layout: `[salt(16)][iv(12)][AES-GCM ciphertext+tag]`. The file is readable ONLY by this React app.
3. All 6 entities are serialized into a single `sync-data.json` member inside the ZIP. Its shape is a `SyncEnvelope`: `{ version: 1, exportedAt, storeId, entities: { categories, products, inventoryEntries, orders, expenses, saleCredits } }` where every `entities.*` value is a plain JSON array. No per-entity file split.
4. The exported filename matches the pattern `datos{YYMMDD-HHmm}.zip`.
5. All 6 entities are always exported: categories, products, inventory-entries, orders, expenses, sale-credits. No opt-out UI.
6. `InventoryEntries` are read and written exclusively via `InventoryRepository` directly (the offline service `getAll()` returns a lossy view).
7. Import is a non-destructive upsert-by-id. Records absent from the file are never deleted from local storage.
8. Import processes categories first, then products, then the remaining four entities (referential integrity).
9. Re-importing the same file is idempotent — no duplicates, no false failures.
10. Import returns per-entity inserted/updated counts that the UI displays.
11. The category name-uniqueness guard is bypassed on import; records are written via plain `repo.upsert()`.
12. A wrong password causes AES-GCM auth-tag verification to fail. The import MUST abort before any repository write and surface a single, clear i18n error to the user.
13. Export delivery uses `navigator.share` when available; falls back to a plain file download otherwise.
14. All `SYNC.*` i18n keys are present in `es.ts`.
15. `fflate` is added to `apps/web-store-pos/package.json`. WebCrypto is browser-native (zero added KB).
16. `pnpm test` passes with more tests than the baseline count confirmed at apply start (Phase 3 archive recorded 353; verify gate MUST re-confirm actual count before asserting); `tsc --noEmit` is clean; `pnpm build` succeeds.

Anything outside this list is out of scope for phase4-sync:

- **Angular interop** — no cross-app format, no Angular-produced fixture, no Angular-readable output. React↔React only. No test involves an Angular-originated file.
- Management and Profile modules (separate future changes).
- `EFeatures.Download` (41) — dormant; no route, no menu, not touched.
- `InventoryRepository` localStorage key mismatch (`inventoryentries` vs `inventory-entries`) — does not affect this change; documented known gap.
- Versioned migration framework — envelope carries `version` field, multi-version migration logic deferred.
- Server-side / cloud sync.

---

## Module 1 — DataSerializerService

### Requirements

**SYNC-1** — `DataSerializerService` MUST be a class under `app/sync/lib/services/`. Its constructor MUST accept `storeId: string`. It MUST NOT access `localStorage` directly; it MUST read data exclusively through the 6 offline service instances (and `InventoryRepository` directly for inventory entries).

**SYNC-2** — `DataSerializerService.export(password: string): Promise<Uint8Array>` MUST:
- Read all 6 entities and wrap each in the uniform envelope `{ version: 1, entity, exportedAt: <ISO>, data: <array> }`.
- ZIP the 6 JSON member files using `fflate`.
- Derive an AES-GCM key via PBKDF2 (SHA-256) from `password` and a randomly generated 16-byte salt.
- Encrypt the zipped bytes with AES-GCM using a randomly generated 12-byte IV.
- Return `[salt(16)][iv(12)][ciphertext+tag]` as a `Uint8Array`.

**SYNC-3** — The ZIP MUST contain exactly ONE member file named `sync-data.json`. This file holds a single `SyncEnvelope` object with the following shape:

```json
{
  "version": 1,
  "exportedAt": "<ISO timestamp>",
  "storeId": "<store id>",
  "entities": {
    "categories":       [...],
    "products":         [...],
    "inventoryEntries": [...],
    "orders":           [...],
    "expenses":         [...],
    "saleCredits":      [...]
  }
}
```

Each `entities.*` value is a plain JSON array of the corresponding entity type. `Object.keys(unzipped)` on the decrypted ZIP MUST equal `['sync-data.json']`. Unknown top-level members in the envelope MUST be silently ignored on import.

> Note: the 6-named-file layout (categories.json, products.json, etc.) was dropped along with Angular interop. The single-envelope approach was chosen to simplify the import pipeline and keep one AES-GCM auth tag covering the whole payload.

**SYNC-4** — The exported filename used by the export route MUST match the pattern `datos{YYMMDD-HHmm}.zip` (e.g. `datos260531-1430.zip`).

**SYNC-5** — `DataSerializerService.import(payload: Uint8Array, password: string): Promise<ParsedData>` MUST:
- Extract `salt` (first 16 bytes) and `iv` (next 12 bytes) from the payload.
- Derive the AES-GCM key via PBKDF2(SHA-256) from `password` and the extracted `salt`.
- Decrypt with AES-GCM. An auth-tag failure (wrong password or tampered ciphertext) MUST cause the promise to reject with a typed error BEFORE any repository write occurs.
- `fflate`-unzip the decrypted bytes; parse each known member's `data` array from its envelope; return as `ParsedData`.

**SYNC-6** — `InventoryEntries` MUST be read via `InventoryRepository` directly during export, and written via `InventoryRepository` directly during sync. Using `InventoryOfflineService.getAll()` for inventory is prohibited.

**SYNC-7** — Providing a wrong password MUST cause `import()` to reject with an error typed as `WrongPasswordError` (or equivalent distinguishable type) before any data is written.

### Scenarios

**S-SER-1: export produces a decryptable single-envelope payload**
- GIVEN a `DataSerializerService` with storeId `'s1'` and all 6 entity stores populated with one record each
- WHEN `export('mypass')` is called
- THEN the returned `Uint8Array` can be decrypted with the same password using `import('mypass')`
- AND the resulting `ParsedData` contains non-empty arrays for all 6 entities
- AND the decrypted ZIP contains exactly one member named `sync-data.json`

**S-SER-2: all entities export as arrays (uniform serialization)**
- GIVEN one category `{ id: 'c1', name: 'Bebidas' }` and one order `{ id: 'o1', total: 100 }` in storage
- WHEN `export('pass')` is called and `sync-data.json` is extracted from the ZIP and parsed
- THEN `envelope.entities.categories` equals `[{ id: 'c1', name: 'Bebidas' }]`
- AND `envelope.entities.orders` equals `[{ id: 'o1', total: 100 }]`
- AND no `entities.*` value uses a Map-entries (`[[id, value], …]`) format

**S-SER-3: empty store export succeeds**
- GIVEN all 6 entity stores return no records
- WHEN `export('pass')` is called
- THEN `sync-data.json` contains a `SyncEnvelope` where all 6 `entities.*` arrays are empty (`[]`)
- AND the call does not throw

**S-SER-4: wrong password rejects before any write**
- GIVEN a payload encrypted with password `'correct'`
- WHEN `import(payload, 'wrong')` is called
- THEN the promise rejects with a `WrongPasswordError`
- AND no repository write method is called

**S-SER-5: unknown ZIP members are ignored**
- GIVEN a ZIP that also contains `metadata.json` and `unknown.json`
- WHEN `import(payload, 'pass')` is called with the correct password
- THEN no error is thrown and `ParsedData` contains only the 6 known entities

**S-SER-6: inventory round-trip preserves all fields**
- GIVEN an `InventoryEntry` with all fields populated (including fields absent from `InventoryEntryView`)
- WHEN `export('pass')` then `import('pass')` is called
- THEN the deserialized entry is deep-equal to the original (no field loss)

---

## Module 2 — DataSynchronizerService

### Requirements

**SYNC-8** — `DataSynchronizerService` MUST be a class under `app/sync/lib/services/`. Its constructor MUST accept the 6 offline service instances and `InventoryRepository`.

**SYNC-9** — `DataSynchronizerService.sync(data: ParsedData): Promise<SyncResult>` MUST upsert every record from `data` into the corresponding accessor. Upsert order MUST be: categories, products, then inventory-entries, orders, expenses, sale-credits (any remaining order).

**SYNC-10** — Upsert MUST be non-destructive: records in local storage absent from `data` MUST NOT be deleted.

**SYNC-11** — For categories, upsert MUST call `repo.upsert(record)` directly (bypassing the user-facing name-uniqueness guard).

**SYNC-12** — `SyncResult` MUST contain per-entity counts: `{ entity: string; inserted: number; updated: number }[]` for all 6 entities.

**SYNC-13** — Re-calling `sync` with identical data MUST be idempotent — same entity presence, no duplicates, no errors.

### Scenarios

**S-SYNC-1: sync upserts new records**
- GIVEN local storage is empty and `data` contains 2 categories and 1 product
- WHEN `sync(data)` is called
- THEN both categories and the product are present in storage
- AND `SyncResult` shows `categories.inserted=2, products.inserted=1`

**S-SYNC-2: sync updates existing records**
- GIVEN category `{ id: 'c1', name: 'Old' }` is in storage and `data` contains `{ id: 'c1', name: 'New' }`
- WHEN `sync(data)` is called
- THEN the stored category has `name: 'New'`
- AND `SyncResult` shows `categories.updated=1, categories.inserted=0`

**S-SYNC-3: sync does not delete local-only records**
- GIVEN category `{ id: 'c-local', name: 'Local Only' }` is in storage and `data.categories` does not contain `'c-local'`
- WHEN `sync(data)` is called
- THEN `'c-local'` is still present in storage after the sync

**S-SYNC-4: sync is idempotent**
- GIVEN `data` contains 3 orders
- WHEN `sync(data)` is called twice
- THEN local storage contains exactly 3 orders (no duplicates)
- AND the second call's `SyncResult` shows `orders.inserted=0, orders.updated=3`

**S-SYNC-5: categories processed before products**
- GIVEN `data` contains a new category `'c-new'` and a new product referencing `'c-new'`
- WHEN `sync(data)` is called
- THEN `'c-new'` exists before the product upsert runs (no referential integrity exception)

---

## Module 3 — Routing and Feature Gating

### Requirements

**SYNC-14** — The route `/sync/export` MUST be registered in `app/routes.ts`. Its loader MUST call `featureLoader([EFeatures.Send])` (value 40). Navigating without feature 40 MUST redirect to the unauthorized route.

**SYNC-15** — The route `/sync/import` MUST be registered in `app/routes.ts`. Its loader MUST call `featureLoader([EFeatures.Receive])` (value 42). Navigating without feature 42 MUST redirect to the unauthorized route.

**SYNC-16** — `EFeatures.Download` (value 41) MUST remain dormant — no route, no menu item, no component references it.

### Scenarios

**S-ROUTE-1: feature gate — Send (40)**
- GIVEN a user without feature 40
- WHEN navigating to `/sync/export`
- THEN the user is redirected to the unauthorized route

**S-ROUTE-2: feature gate — Receive (42)**
- GIVEN a user without feature 42
- WHEN navigating to `/sync/import`
- THEN the user is redirected to the unauthorized route

**S-ROUTE-3: export route renders ExportForm for authorized user**
- GIVEN a user with feature 40
- WHEN navigating to `/sync/export`
- THEN the export page renders (no redirect)

**S-ROUTE-4: import route renders ImportForm for authorized user**
- GIVEN a user with feature 42
- WHEN navigating to `/sync/import`
- THEN the import page renders (no redirect)

---

## Module 4 — Export UI (ExportForm)

### Requirements

**SYNC-17** — `ExportForm` MUST provide a password input and an export button. Submitting with a non-empty password MUST call `DataSerializerService.export(password)`.

**SYNC-18** — Submitting with an empty password MUST NOT call `export()`; a validation error (key `SYNC.ERROR_EMPTY_PASSWORD`) MUST be shown.

**SYNC-19** — During export, a loading indicator MUST be displayed and the export button MUST be disabled.

**SYNC-20** — On export success, the system MUST attempt delivery via `navigator.share` (Web Share API) with the generated file. When `navigator.share` is unavailable or throws, the system MUST fall back to a plain programmatic file download (no WhatsApp deep-link).

### Scenarios

**S-EXPORT-1: empty password blocked**
- GIVEN the export form is rendered
- WHEN the user submits with an empty password
- THEN `DataSerializerService.export` is NOT called and a validation error is visible

**S-EXPORT-2: export triggers share on success**
- GIVEN `navigator.share` is available and `DataSerializerService.export` resolves
- WHEN the user submits a valid password
- THEN `navigator.share` is called with a File constructed from the exported bytes

**S-EXPORT-3: plain download fallback when navigator.share is unavailable**
- GIVEN `navigator.share` is undefined
- WHEN export completes successfully
- THEN a programmatic anchor-based download is triggered (no WhatsApp link)

**S-EXPORT-4: loading state during export**
- GIVEN export is in progress (promise pending)
- WHEN the component is inspected
- THEN a loading indicator is visible and the export button is disabled

---

## Module 5 — Import UI (ImportForm)

### Requirements

**SYNC-21** — `ImportForm` MUST provide a file picker (`.zip` files only), a password input, and an import button. Submitting MUST call `DataSerializerService.import(payload, password)` then `DataSynchronizerService.sync(parsedData)`.

**SYNC-22** — Submitting without a file or with an empty password MUST NOT call `import()`; a validation error MUST be shown for each missing field.

**SYNC-23** — During import, a loading indicator MUST be displayed and the import button MUST be disabled.

**SYNC-24** — On import success, `ImportForm` MUST display a per-entity result summary showing inserted and updated counts for all 6 entities.

**SYNC-25** — On wrong-password error (AES-GCM auth-tag failure), the user-facing message MUST use key `SYNC.ERROR_WRONG_PASSWORD`. No data is written to storage.

**SYNC-26** — On corrupt or unreadable file (non-AES-GCM failure, malformed ZIP, invalid JSON envelope), the user-facing message MUST use key `SYNC.ERROR_CORRUPT_FILE`. No data is written to storage.

### Scenarios

**S-IMPORT-1: missing file blocked**
- GIVEN no file is selected
- WHEN the user submits the import form
- THEN `DataSerializerService.import` is NOT called and a validation error is visible

**S-IMPORT-2: missing password blocked**
- GIVEN a file is selected but the password field is empty
- WHEN the user submits
- THEN `DataSerializerService.import` is NOT called and a validation error is visible

**S-IMPORT-3: successful import shows per-entity counts**
- GIVEN a valid exported file with 2 categories and 3 orders is provided with the correct password
- WHEN import and sync complete
- THEN the result summary shows inserted + updated counts for all 6 entities

**S-IMPORT-4: wrong password shows specific error, no writes**
- GIVEN a file exported with password `'correct'`
- WHEN the user provides password `'wrong'` and submits
- THEN the error message using `SYNC.ERROR_WRONG_PASSWORD` is displayed
- AND no records are written to storage

**S-IMPORT-5: corrupt file shows generic error, no writes**
- GIVEN the selected file is not a valid encrypted payload (random bytes)
- WHEN import is attempted
- THEN the error message using `SYNC.ERROR_CORRUPT_FILE` is displayed
- AND no records are written to storage

**S-IMPORT-6: import-twice idempotency**
- GIVEN a file has already been imported once (storage reflects its records)
- WHEN the same file is imported a second time with the correct password
- THEN no duplicates are created and the sync result shows all records as updated (inserted=0)

---

## Module 6 — i18n

### Requirements

**SYNC-27** — The following i18n keys MUST be added to `app/shared/lib/i18n/es.ts`:

| Key | Purpose |
|-----|---------|
| `SYNC.EXPORT_TITLE` | Export page title |
| `SYNC.IMPORT_TITLE` | Import page title |
| `SYNC.PASSWORD_LABEL` | Password input label |
| `SYNC.EXPORT_BUTTON` | Export submit button |
| `SYNC.IMPORT_BUTTON` | Import submit button |
| `SYNC.FILE_LABEL` | File picker label |
| `SYNC.EXPORTING` | Loading indicator text during export |
| `SYNC.IMPORTING` | Loading indicator text during import |
| `SYNC.SUCCESS_TITLE` | Result summary heading |
| `SYNC.RESULT_INSERTED` | "inserted" label in result summary |
| `SYNC.RESULT_UPDATED` | "updated" label in result summary |
| `SYNC.ERROR_WRONG_PASSWORD` | Wrong-password / auth-tag failure error message |
| `SYNC.ERROR_CORRUPT_FILE` | Corrupt / unreadable file error message |
| `SYNC.ERROR_EMPTY_PASSWORD` | Empty password validation message |
| `SYNC.ERROR_NO_FILE` | Missing file validation message |

### Scenarios

**S-I18N-1: all SYNC keys present**
- GIVEN `es.ts` is imported at runtime
- WHEN any `SYNC.*` key listed in SYNC-27 is looked up
- THEN the lookup returns a non-empty string (no missing key falls through to the raw key)

---

## Cross-cutting Requirements

**CC-1** — Both route files MUST export a `default` page function and a named `loader` export using `featureLoader`, consistent with the existing route pattern.

**CC-2** — Both routes MUST be registered in `apps/web-store-pos/app/routes.ts`.

**CC-3** — `fflate` MUST be added to `apps/web-store-pos/package.json` as a production dependency. `@zip.js/zip.js` MUST NOT be added or referenced.

**CC-4** — All new files MUST use kebab-case filenames (e.g. `data-serializer-service.ts`, `export-form.tsx`).

**CC-5** — No existing test MUST fail after phase4-sync is applied. The post-phase4-sync test count MUST be strictly greater than the baseline confirmed at apply start (Phase 3 archive recorded 353; re-confirm actual count before asserting the gate).

**CC-6** — `tsc --noEmit` (run as `pnpm -C apps/web-store-pos exec tsc --noEmit`) MUST exit with code 0.

**CC-7** — `pnpm build` MUST succeed and both `/sync/export` and `/sync/import` routes MUST resolve.

---

## Acceptance Gate

The following items are the checklist `sdd-verify` MUST validate:

1. **`fflate` in package.json:** `apps/web-store-pos/package.json` lists `fflate` as a dependency. `@zip.js/zip.js` is absent.
2. **Route registration — Export:** `/sync/export` is registered in `routes.ts`; its loader calls `featureLoader([EFeatures.Send])` with value 40.
3. **Route registration — Import:** `/sync/import` is registered in `routes.ts`; its loader calls `featureLoader([EFeatures.Receive])` with value 42.
4. **Feature gate — Export (40):** S-ROUTE-1 passes.
5. **Feature gate — Import (42):** S-ROUTE-2 passes.
6. **DataSerializerService — export contract:** S-SER-1 through S-SER-3 pass (single-envelope `sync-data.json`, all 6 entity arrays present, empty-store safe, correct fflate+WebCrypto pipeline).
7. **DataSerializerService — import contract:** S-SER-4 through S-SER-6 pass (wrong-password abort before write, unknown members ignored, inventory field round-trip).
8. **DataSynchronizerService — upsert logic:** S-SYNC-1 through S-SYNC-5 pass (insert, update, non-destructive, idempotent, category-first order).
9. **ExportForm — validation and delivery:** S-EXPORT-1 through S-EXPORT-4 pass (empty-password blocked, share API, plain-download fallback, loading state).
10. **ImportForm — validation, results, errors:** S-IMPORT-1 through S-IMPORT-6 pass (missing inputs blocked, success counts, wrong-password error, corrupt-file error, idempotent re-import).
11. **No Angular fixture in tests:** No test file imports, reads, or references an Angular-produced ZIP or Angular-format fixture.
12. **i18n keys:** All 15 keys listed in SYNC-27 exist in `es.ts` with non-empty values.
13. **EFeatures.Download dormant:** No route, component, or menu item references `EFeatures.Download` (41).
14. **TypeScript clean:** `pnpm -C apps/web-store-pos exec tsc --noEmit` exits 0.
15. **Build succeeds:** `pnpm build` exits 0 and both sync routes resolve.
16. **Test count increases:** `pnpm test` exits 0 with strictly more passing tests than baseline (re-confirm baseline at apply start).
17. **No regressions:** All pre-existing tests still pass.

---

## Risks and Spec-Level Assumptions

1. **Uniform serialization is a hard contract.** Every entity's `data` field is a plain JSON array. No Map-entries format. Any deviation breaks import compatibility between export and import within this app.

2. **Wrong password = AES-GCM auth-tag failure.** WebCrypto will throw a `DOMException` (name `OperationError`) when decryption fails. The service layer MUST catch this specifically and re-throw as `WrongPasswordError` so the UI can route to the correct i18n key. A generic `catch` that maps all errors to the same message is non-compliant.

3. **Test count baseline is 353 (Phase 3 archive).** Re-confirm actual count when apply begins. If the count has changed, acceptance gate item 16 MUST be updated before asserting.

4. **`fflate` is the only ZIP library.** `@zip.js/zip.js` MUST NOT be introduced. Encryption is exclusively via browser-native WebCrypto; no library-native ZIP encryption.

5. **Inventory accessor.** If `InventoryRepository` is not directly injectable (e.g. it is only constructed internally by `InventoryOfflineService`), design MUST expose a path to inject or access it. This is a design-phase concern, but if the repository is inaccessible, SYNC-6 blocks apply.

6. **Export fallback.** WhatsApp deep-link is explicitly removed. Plain programmatic download (anchor `href` + `click()`) is the only approved fallback. Any WhatsApp-specific code in the export flow is non-compliant.
