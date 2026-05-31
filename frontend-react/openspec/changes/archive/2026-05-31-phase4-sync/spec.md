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

## Acceptance Gate (17 items, all PASS)

1. **`fflate` in package.json:** PASS
2. **Route registration — Export:** PASS
3. **Route registration — Import:** PASS
4. **Feature gate — Export (40):** PASS
5. **Feature gate — Import (42):** PASS
6. **DataSerializerService — export contract:** PASS
7. **DataSerializerService — import contract:** PASS
8. **DataSynchronizerService — upsert logic:** PASS
9. **ExportForm — validation and delivery:** PASS
10. **ImportForm — validation, results, errors:** PASS
11. **No Angular fixture in tests:** PASS
12. **i18n keys:** PASS (all 15 SYNC.* keys present)
13. **EFeatures.Download dormant:** PASS
14. **TypeScript clean:** PASS
15. **Build succeeds:** PASS
16. **Test count increases:** PASS (402 > 353)
17. **No regressions:** PASS
