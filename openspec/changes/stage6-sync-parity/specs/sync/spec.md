# Stage 6 — Sync + PWA Cross-Cutting Parity Specification

## Purpose

Close Stage 6 of the Angular → React parity audit (Angular `frontend/` is source of truth): rewrite the sync export/import backup format for full Angular interop and restore domain-validated imports (Slice A), bring sync forms to the shared UI kit (Slice B), add the missing client-side usage-tracker write-side (Slice C), and add periodic service-worker update polling (Slice D). Binding decisions: engram #639.

## Requirements — Slice A: Backup Format + Import Validation

### Requirement: Angular-Compatible Backup Format

Export MUST produce a ZIP containing 6 separate password-protected AES JSON files (`products.json`, `categories.json`, `inventory-entries.json`, `orders.json`, `expenses.json`, `sale-credits.json`), matching Angular's `data-serializer.service.ts` byte-for-byte format (zip.js native AES password encryption, WinZip AE spec). This REPLACES React's current single-envelope AES-GCM/PBKDF2 scheme.

#### Scenario: Angular-exported backup imports into React
- GIVEN a `.zip` backup exported by the Angular app with a known password
- WHEN a React user imports it with the same password and matching store context
- THEN the import succeeds and all 6 entity files are decrypted and merged

#### Scenario: React-exported backup imports into Angular
- GIVEN a `.zip` backup exported by React with a known password
- WHEN it is imported into the Angular app with the same password and store context
- THEN the import succeeds, confirming round-trip interoperability

### Requirement: Store-Scoped Backup Decryption

The decryption password MUST be derived by combining the user-supplied password with the exporting session's `selectedStoreId`, so a backup only decrypts within the store context it was exported from.

#### Scenario: Same store, correct password succeeds
- GIVEN a backup exported while `selectedStoreId=A`
- WHEN importing with the correct password while `selectedStoreId=A`
- THEN decryption succeeds

#### Scenario: Different store, correct password fails
- GIVEN a backup exported while `selectedStoreId=A`
- WHEN importing with the same password while `selectedStoreId=B`
- THEN decryption fails with a wrong-password/corrupt-file error

### Requirement: Domain-Validated Import With Abort-and-Revert

Import MUST route merge writes through domain repositories that enforce existing business rules (e.g., category/product name uniqueness), replacing the current raw-storage bypass that never fails. On first validation failure for products or categories, the system MUST abort that entity type's merge and revert it to its pre-import state; no partial or inconsistent writes may persist.

#### Scenario: Duplicate category name rejected and reverted
- GIVEN an import file containing a category name that already exists in the target store
- WHEN the import runs
- THEN the category merge fails, categories revert to their pre-import state, and a typed merge error is surfaced

#### Scenario: No-write-on-failure preserved for decrypt/parse errors
- GIVEN a corrupt file or wrong password
- WHEN import is attempted
- THEN decrypt/parse fails before any repository write occurs (existing guarantee unchanged)

## Requirements — Slice B: Sync Forms

### Requirement: Shared UI Kit Forms

Export and import forms MUST be built on the shared `Card` (title = `SYNC.EXPORT_TITLE`/`IMPORT_TITLE`), `Button` (variant `fab`), and `InfoBox` (result/error banners) components, replacing raw markup and hand-rolled Tailwind classes.

#### Scenario: Export form uses shared kit
- GIVEN a user opens the export page
- WHEN the page renders
- THEN the title, submit action, and result banner render via `Card`, `Button` (fab), and `InfoBox`

### Requirement: Password Visibility Toggle

Both export and import forms MUST provide a show/hide toggle for the password field.

#### Scenario: Toggle reveals password
- GIVEN a password field with hidden text
- WHEN the user activates the toggle
- THEN the password becomes visible as plain text, and toggling again re-hides it

### Requirement: Translated Error Fallback

Unexpected (non-typed) errors MUST surface a translated catch-all message; a raw untranslated `err.message` MUST NOT reach the UI.

#### Scenario: Unexpected error shows translated text
- GIVEN an unexpected error occurs during export or import
- WHEN the error banner renders
- THEN it displays a translated Spanish message, never a raw English exception string

## Requirements — Slice C: Usage-Tracker Write-Side

### Requirement: Daily Store Activity Recording

The system MUST record "store active today" on route navigation, buffering the flag per authenticated user in `localStorage` (`lizoft.store-daily-usage-{userId}`), scoped by `userId` + `selectedStoreId`.

#### Scenario: Navigation marks today active
- GIVEN an authenticated user with a selected store navigates to any route
- WHEN the navigation completes
- THEN today's date is recorded as active in that user's local buffer

### Requirement: Buffered POST With Mutex

Unsaved active days MUST be POSTed to `/usages/store-daily-usage`, guarded by an authenticated + non-empty-store check and a `sending` mutex preventing concurrent POSTs.

#### Scenario: Buffered days flush on activity
- GIVEN unsaved active days exist in the local buffer
- WHEN the tracker runs with a valid auth/store context and no POST in flight
- THEN the unsaved days are POSTed and marked as saved on success

#### Scenario: Concurrent navigation does not duplicate POST
- GIVEN a POST to `/usages/store-daily-usage` is already in flight
- WHEN another navigation event fires
- THEN no second concurrent POST is issued until the first completes

## Requirements — Slice D: Service-Worker Update Polling

### Requirement: Periodic Update Check

While the app remains open, the registered service worker MUST poll `registration.update()` on an interval of approximately 15 minutes, in addition to the existing update-available confirm/apply flow.

#### Scenario: Long-lived open tab discovers a new version
- GIVEN a POS tab has been open for over 15 minutes with no manual reload
- WHEN the periodic poll runs and a new service-worker version exists on the server
- THEN the existing update-available prompt is triggered without requiring a manual refresh

## Out of Scope

The following Angular features are DEAD (no live call sites or never-rendered UI) and MUST NOT be ported:
- Connection interceptor/service (`connection-interceptor.service.ts`, `connection.service.ts`) — fully commented out; React's `useOnlineStatus()` already exceeds it.
- Download-manager service + download-progress UI — fake `Math.random()` progress simulation, component never rendered in any template.
- `SendDataComponent.shareData()` — defined but never bound to any element.
- `MENU.SYNCHRONIZATION.{DOWNLOAD,SEND,RECEIVE}` i18n keys — back a commented-out menu item.

Cart UI and inventory-availability parity are NOT re-scoped here (already closed in Stages 1 and 2).
