# Design: Stage 6 Sync + PWA Cross-Cutting Parity

## Technical Approach

Four slices. **Slice A** rewrites the React sync serializer/synchronizer to be byte-interoperable with Angular (source of truth): drop AES-GCM/PBKDF2 + fflate, adopt `@zip.js/zip.js` password-protected AES with the same 6-file layout, and restore domain validation on import. **B/C/D** are light: UI kit adoption, a client usage tracker, and a SW update poll. A is the only architecturally sensitive work and is TDD-gated by a real Angular `.zip` fixture.

## Architecture Decisions

| # | Decision | Rejected alternative | Rationale |
|---|----------|---------------------|-----------|
| ADR-1 | Rewrite `data-serializer-service.ts` to `@zip.js/zip.js`: 6 password-AES JSON entries, password = `userPassword + selectedStoreId` | Keep AES-GCM/PBKDF2 + single-envelope fflate | Backups must be interchangeable Angular↔React during migration; restores dropped store-scoping. |
| ADR-2 | Restore domain validation on import; route category/product writes through name-uniqueness guard, whole-type revert on failure | Keep raw `BaseRepository.upsert` that never fails | Prevents silently importing invalid state (duplicate names) Angular rejects. |
| ADR-3 | **No** backward-compat reader for legacy React AES-GCM/fflate backups | Dual-format detect-and-decode | Angular is live source of truth; app mid-migration; no React-format backups exist in the wild → clean cutover. |
| ADR-4 | Slice C = client `StoreUsageTracker` mirroring Angular: router-nav → localStorage buffer → POST, mutex | Server-inferred usage | Direct parity; admin dashboard read-side already ships and will read zero for migrated stores otherwise. |
| ADR-5 | Slice D = `registration.update()` 15-min poll in `registerServiceWorker` via `onRegisteredSW` | Rely on Workbox defaults | All-day POS tab must discover new versions mid-session (Angular polls 15 min). |

## Angular Format Spec (extracted — match 1:1)

- **Lib**: `@zip.js/zip.js` — export `new ZipWriter(new BlobWriter('application/zip'), { password })`, then `zipWriter.add(name, new TextReader(content))` per file, `await zipWriter.close()`. Import `new ZipReader(new BlobReader(file), { password })` → `getEntries()` → `entry.getData(new TextWriter())`.
- **Encryption strength**: Angular passes NO `encryptionStrength` → zip.js default `3` (AES-256, WinZip AE-2). React MUST also omit it (do not force a value).
- **Password concat**: `password + selectedStoreId` — plain string concat, password first, NO separator; zip.js UTF-8 encodes internally. Identical on export and import.
- **6 entries** (write order = Angular `getDataFiles`) and React source repo:

| Entry filename | Content shape | React source |
|---|---|---|
| `categories.json` | `[[id, ProductCategory], …]` (Map entries) | `ProductCategoryOfflineService` |
| `products.json` | `[[id, Product], …]` (Map entries) | `ProductOfflineService` |
| `inventory-entries.json` | `[[productId, InventoryEntry[]], …]` (Map entries) | `InventoryRepository` |
| `orders.json` | `Order[]` (plain array) | `OrderOfflineService` |
| `expenses.json` | `Expense[]` (plain array) | `ExpenseOfflineService` |
| `sale-credits.json` | `SaleCredit[]` (plain array) | `SaleCreditOfflineService` |

- **Import ordering**: Angular unshifts `categories.json` to the front so categories always merge first (referential integrity before products); remaining entries in zip order.
- **Revert semantics (match Angular's ACTUAL behavior, not ADR-2 shorthand)**:
  - Products & Categories: iterate items sorted by `order`; **break on first failed item**; on failure **revert the whole entity-type map** to its pre-import snapshot.
  - Inventory / Orders / Expenses / SaleCredits: break on first failed item, **NO revert** (partial writes persist — Angular's revert is commented out).
  - `synchronizeFiles`: processes each file, aggregates errors, **continues across files**, returns `Failure` if any error collected. It is NOT a global abort-on-first.
- **Errors**: `SynchronizerErrors` = 4 codes (Products/Categories/Orders/Inventory `UnexpectedError`) + a name-exists failure surfaced from the guard.

## Data Flow (Slice A)

    export: readers → 6 JSON strings → ZipWriter(+password) → Blob → share/download
    import: File → ZipReader(+password) → entries → [categories-first] → synchronizer
             → per-type validate+write → revert(products/categories) on fail → MergeResult

## File Changes

| File | Action | Slice |
|------|--------|-------|
| `apps/web-store-pos/package.json` | Modify — add `@zip.js/zip.js`, remove `fflate` (confirm no other consumers first) | A |
| `app/sync/lib/services/data-serializer-service.ts` | Rewrite — zip.js 6-file AES, drop crypto envelope | A |
| `app/sync/lib/services/data-synchronizer-service.ts` | Rewrite — categories-first, name-uniqueness guard, whole-type revert, `SyncResult` | A |
| `app/sync/routes/{export,import}.tsx` | Modify — wiring for new serializer contract | A |
| `app/sync/lib/services/__tests__/*` + fixture `angular-export.zip` | Create/Modify — round-trip + revert tests | A |
| `app/sync/components/{export,import}-form.tsx` | Modify — `Card`/`Button(fab)`/`InfoBox`, password show/hide toggle, translated error fallback | B |
| `app/shared/lib/i18n/es.ts` (`SYNC.*`) | Modify — add catch-all error key | B |
| `app/shared/.../usage/store-usage-tracker.ts` (+ root hook) | Create — nav-effect, localStorage buffer, POST, mutex | C |
| `app/root.tsx` | Modify — `onRegisteredSW` 15-min `registration.update()` poll | D |

## Interfaces

    // synchronizer — replaces count-only MergeResult with pass/fail
    interface SyncEntityError { code: string; description: string }
    interface SyncResult { succeeded: boolean; errors: SyncEntityError[]; merges: EntityMergeResult[] }
    // category/product guard: reject when getByName(x).id !== incoming.id

Category/product validation lives in the synchronizer (React services expose `getByName`/`save` but no Result-returning imported-add/update), replicating Angular's `add/updateImportedProductCategory` name rule.

## Testing Strategy

| Slice | Layer | Tests |
|-------|-------|-------|
| A | Unit/parity (TDD) | Round-trip vs real Angular `.zip` fixture (decrypt+parse, assert 6 entries + shapes); wrong-password → typed error before any write; import-no-write preserved; **category/product duplicate-name → whole-type revert**; inventory/orders/etc. → break, no revert |
| B | Component | Toggle reveals password; error fallback is translated; Card/Button/InfoBox render |
| C | Unit | Buffers once/day; POST only unsaved days; mutex blocks concurrent sends; scoped by `userId`+`selectedStoreId` |
| D | Unit | `registration.update()` invoked on interval; inert without SW |

## Slice Independence

A, C, D fully parallel (disjoint files). B touches only sync UI — parallel with C/D, but land after A to avoid a forms rewrite conflict. Chained/stacked delivery; A dominates the 400-line budget.

## Dead-Code Exclusions (documented, no code)

Connection interceptor/service (React `useOnlineStatus` exceeds it), download-manager + download-progress UI (invisible fake progress), `SendDataComponent.shareData()`, `MENU.SYNCHRONIZATION.{DOWNLOAD,SEND,RECEIVE}` keys. Cart/inventory not re-scoped (Stages 1/2).

## Migration / Rollout

Clean cutover (ADR-3): no dual-format reader. Parity gate = fixture round-trip must pass before merge.

## Open Questions

- [ ] Whole-zip byte-for-byte is NOT achievable (zip.js metadata/timestamps differ); parity = mutual **readability** + entry-name/content-shape match. Confirm this is the accepted gate.
- [ ] Confirm `fflate` has no other consumers before removal.
