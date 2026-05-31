# Tasks: phase4-sync — Synchronization (Export / Import)

**Change:** phase4-sync
**Baseline test count to re-confirm at apply start:** 353 (Phase 3 archive)
**Entity keys + dateFields verified from source:**
- `product-categories` — no dateFields
- `products` — `['createdDate', 'updatedDate']`
- `orders` — `['date', 'createdDate', 'updatedDate']`
- `expenses` — `['date', 'createdDate', 'updatedDate']`
- `saleCredits` — `['date', 'paidDate', 'createdDate', 'updatedDate']`
- `InventoryRepository` uses key `inventoryentries` (note: no dash); revives `date`, `createdDate`, `updatedDate`
- categories write: `ProductCategoryOfflineService.save(cat)` = `repo.upsert` (plain, bypasses name guard)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated new files | 8 (2 routes, 2 components, 2 services, 2 test suites) |
| Estimated modified files | 3 (routes.ts, es.ts, package.json) |
| Estimated changed lines | 700–950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → Slice 1 (services + tests) · PR 2 → Slice 2 (routes + forms + i18n + registration) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user decision required) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `DataSerializerService` + `DataSynchronizerService` + full test suites (T1–T10) | PR 1 | Standalone: no UI, no route changes; base = feature/phase4-sync |
| 2 | Routes + forms + i18n keys + `routes.ts` + `package.json` registration | PR 2 | Depends on Slice 1 services; base = PR 1 branch |

---

## Phase 0: Baseline Verification

- [ ] **T-0.1** — Run `pnpm test` and record passing count; MUST equal 353 (or update gate if different). Blocks all subsequent tasks. Satisfies CC-5.
- [ ] **T-0.2** — Run `pnpm -C apps/web-store-pos exec tsc --noEmit`; MUST exit 0 before any code changes. Satisfies CC-6.

---

## Phase 1: Dependency Installation

- [ ] **T-1.1** — Add `"fflate": "^0.8.2"` to `apps/web-store-pos/package.json` `dependencies`. Run `pnpm install`. Confirm `@zip.js/zip.js` is absent. Satisfies CC-3, SYNC-2, SYNC-5.

---

## Phase 2: Types and Error Class (Foundation)

- [ ] **T-2.1** — Create `apps/web-store-pos/app/sync/lib/services/data-serializer-service.ts` skeleton: export `WrongPasswordError extends Error` class (typed discriminant); export empty `DataSerializerService` class stub with constructor `(storeId: string)` and method stubs `export(password: string): Promise<Uint8Array>` + `import(payload: Uint8Array, password: string): Promise<ParsedData>`. Export `ParsedData` and `SyncEnvelope` interfaces. Satisfies SYNC-1, SYNC-7.
- [ ] **T-2.2** — Create `apps/web-store-pos/app/sync/lib/services/data-synchronizer-service.ts` skeleton: export `MergeResult` interface; export empty `DataSynchronizerService` class stub with constructor accepting 6 offline services + `InventoryRepository` and `sync(data: ParsedData): Promise<MergeResult>` stub. Satisfies SYNC-8, SYNC-12.

---

## Phase 3: Serializer Service — Test-First (Slice 1)

- [ ] **T-3.1** [RED] — Create `apps/web-store-pos/app/sync/lib/services/__tests__/data-serializer-service.test.ts`. Write failing tests T1–T6 from the design test matrix: envelope round-trip (T1), zip round-trip (T2), encryption round-trip (T3), wrong-password rejection + no-write spy (T4), full export→import round-trip (T5), inventory no-loss round-trip (T6). All must fail. Satisfies S-SER-1, S-SER-2, S-SER-3, S-SER-4, S-SER-5, S-SER-6, SYNC-2, SYNC-3, SYNC-5, SYNC-6, SYNC-7.
- [ ] **T-3.2** [GREEN] — Implement `DataSerializerService.export(password)`: read all 6 entities via offline services + `InventoryRepository.getAll(storeId)` (flatten Map to array); build `SyncEnvelope`; `zipSync` 6 member files; PBKDF2-derive AES-GCM key (210k iter, SHA-256, 16B random salt); `subtle.encrypt` with 12B random IV; return `[salt(16)][iv(12)][ciphertext+tag]`. T1–T3, T5 now green. Satisfies SYNC-2, SYNC-3, SYNC-6.
- [ ] **T-3.3** [GREEN] — Implement `DataSerializerService.import(payload, password)`: slice salt/iv/cipher from payload; derive key; `subtle.decrypt` — catch `DOMException` → throw `WrongPasswordError` before any write; `unzipSync`; parse each known member's `data` array; return `ParsedData`. Unknown members silently ignored. T4, T5, T6 now green. Satisfies SYNC-5, SYNC-6, SYNC-7, S-SER-4, S-SER-5, S-SER-6.
- [ ] **T-3.4** [VERIFY] — Run `pnpm test`; T1–T6 green; test count > 353.

---

## Phase 4: Synchronizer Service — Test-First (Slice 1)

- [ ] **T-4.1** [RED] — In `apps/web-store-pos/app/sync/lib/services/__tests__/data-synchronizer-service.test.ts`, write failing tests T7–T10: merge upsert-by-id (T7), categories-before-products order spy (T8), import-twice idempotency (T9), envelope validation (T10). All must fail. Satisfies S-SYNC-1, S-SYNC-2, S-SYNC-3, S-SYNC-4, S-SYNC-5, SYNC-8, SYNC-9, SYNC-10, SYNC-11, SYNC-12, SYNC-13.
- [ ] **T-4.2** [GREEN] — Implement `DataSynchronizerService.sync(data)`: upsert order = categories → products → inventoryEntries → orders → expenses → saleCredits. Categories via `ProductCategoryOfflineService.save(cat)`. Products/orders/expenses/saleCredits via `new BaseRepository<T>(entityKey, dateFields).upsert(storeId, record)` with verified keys. InventoryEntries: group by `productId`, merge by entry `id` into `InventoryRepository.getByProductId`, then `InventoryRepository.save`. Return `MergeResult` with per-entity `{inserted, updated}` counts (check pre-existing map before write). T7–T9 now green. Satisfies SYNC-8, SYNC-9, SYNC-10, SYNC-11, SYNC-12, SYNC-13.
- [ ] **T-4.3** [GREEN] — Implement envelope validation guard in `DataSerializerService.import`: if `version !== 1` or `entities` missing → throw `WrongPasswordError` or a distinct `CorruptFileError`. T10 now green. Satisfies SYNC-5, S-SER-5.
- [ ] **T-4.4** [VERIFY] — Run `pnpm test`; T7–T10 green; confirm Slice 1 tests all pass; count > 353.
- [ ] **T-4.5** — Run `pnpm -C apps/web-store-pos exec tsc --noEmit`; exit 0. Satisfies CC-6.

> **Slice 1 complete** — PR 1 boundary here (services + 2 test files + package.json).

---

## Phase 5: i18n Keys (Slice 2)

- [ ] **T-5.1** — Add all 15 `SYNC.*` keys to `apps/web-store-pos/app/shared/lib/i18n/es.ts`: `SYNC.EXPORT_TITLE`, `SYNC.IMPORT_TITLE`, `SYNC.PASSWORD_LABEL`, `SYNC.EXPORT_BUTTON`, `SYNC.IMPORT_BUTTON`, `SYNC.FILE_LABEL`, `SYNC.EXPORTING`, `SYNC.IMPORTING`, `SYNC.SUCCESS_TITLE`, `SYNC.RESULT_INSERTED`, `SYNC.RESULT_UPDATED`, `SYNC.ERROR_WRONG_PASSWORD`, `SYNC.ERROR_CORRUPT_FILE`, `SYNC.ERROR_EMPTY_PASSWORD`, `SYNC.ERROR_NO_FILE`. All values must be non-empty Spanish strings. Satisfies SYNC-27, S-I18N-1.

---

## Phase 6: Route Containers — Test-First (Slice 2)

- [ ] **T-6.1** [RED] — Write failing test for export route feature gate in existing or new test file under `apps/web-store-pos/app/sync/routes/__tests__/`: assert loader calls `featureLoader([EFeatures.Send])` (value 40) and redirects without feature. Satisfies S-ROUTE-1, S-ROUTE-3, SYNC-14.
- [ ] **T-6.2** [RED] — Write failing test for import route feature gate: assert loader calls `featureLoader([EFeatures.Receive])` (value 42) and redirects without feature. Satisfies S-ROUTE-2, S-ROUTE-4, SYNC-15.
- [ ] **T-6.3** [GREEN] — Create `apps/web-store-pos/app/sync/routes/export.tsx`: `export const loader = featureLoader([EFeatures.Send]);`; container instantiates `DataSerializerService`; `handleExport(password)` calls `svc.export` → triggers `navigator.share` when available, falls back to programmatic anchor download (no WhatsApp link); renders `<ExportForm>`. Export `default ExportPage`. Satisfies CC-1, SYNC-14, SYNC-20.
- [ ] **T-6.4** [GREEN] — Create `apps/web-store-pos/app/sync/routes/import.tsx`: `export const loader = featureLoader([EFeatures.Receive]);`; container instantiates `DataSerializerService` + `DataSynchronizerService`; `handleImport(file, password)` reads file bytes → `serializer.import` (abort+show `SYNC.ERROR_WRONG_PASSWORD` on `WrongPasswordError`; show `SYNC.ERROR_CORRUPT_FILE` on other errors) → `synchronizer.sync` → set result summary. Renders `<ImportForm>`. Export `default ImportPage`. Satisfies CC-1, SYNC-15, SYNC-25, SYNC-26.
- [ ] **T-6.5** [VERIFY] — Route loader tests pass; run `pnpm test`. Satisfies S-ROUTE-1, S-ROUTE-2, S-ROUTE-3, S-ROUTE-4.

---

## Phase 7: Presentational Forms — Test-First (Slice 2)

- [ ] **T-7.1** [RED] — Write failing tests for `ExportForm` in `apps/web-store-pos/app/sync/components/__tests__/export-form.test.tsx`: empty-password blocked (S-EXPORT-1), share API called on success (S-EXPORT-2), anchor download fallback when share unavailable (S-EXPORT-3), loading state disables button (S-EXPORT-4). Satisfies SYNC-17, SYNC-18, SYNC-19, SYNC-20.
- [ ] **T-7.2** [GREEN] — Create `apps/web-store-pos/app/sync/components/export-form.tsx`: password input (`type="password"`), export button (disabled while `busy`), loading indicator, error slot. All copy via `intl.formatMessage`. Empty password shows `SYNC.ERROR_EMPTY_PASSWORD` without calling `onExport`. Satisfies SYNC-17, SYNC-18, SYNC-19, SYNC-20.
- [ ] **T-7.3** [RED] — Write failing tests for `ImportForm` in `apps/web-store-pos/app/sync/components/__tests__/import-form.test.tsx`: missing file blocked (S-IMPORT-1), missing password blocked (S-IMPORT-2), success shows per-entity counts (S-IMPORT-3), wrong-password error + no-write (S-IMPORT-4), corrupt-file error + no-write (S-IMPORT-5), import-twice idempotency (S-IMPORT-6). Satisfies SYNC-21, SYNC-22, SYNC-23, SYNC-24, SYNC-25, SYNC-26.
- [ ] **T-7.4** [GREEN] — Create `apps/web-store-pos/app/sync/components/import-form.tsx`: file picker (`<input type="file" accept=".zip">`), password input, import button (disabled while `busy`), loading indicator, result summary (per-entity inserted/updated for all 6), error slot. Shows `SYNC.ERROR_NO_FILE` and `SYNC.ERROR_EMPTY_PASSWORD` for missing inputs without calling `onImport`. Satisfies SYNC-21, SYNC-22, SYNC-23, SYNC-24.
- [ ] **T-7.5** [VERIFY] — All form tests pass; run `pnpm test`.

---

## Phase 8: Route Registration (Slice 2)

- [ ] **T-8.1** — Register both sync routes inside the `app-layout` block in `apps/web-store-pos/app/routes.ts`: `route('sync/export', 'sync/routes/export.tsx')` and `route('sync/import', 'sync/routes/import.tsx')`. Satisfies CC-2, SYNC-14, SYNC-15.

---

## Phase 9: Final Verification

- [ ] **T-9.1** — Run `pnpm test`; must exit 0 with strictly more passing tests than baseline (re-confirm T-0.1 count); no regressions. Satisfies CC-5.
- [ ] **T-9.2** — Run `pnpm -C apps/web-store-pos exec tsc --noEmit`; must exit 0. Satisfies CC-6.
- [ ] **T-9.3** — Run `pnpm build`; must succeed; both `/sync/export` and `/sync/import` routes must resolve. Satisfies CC-7.
- [ ] **T-9.4** — Confirm `EFeatures.Download` (41) is dormant: run `rg "Download" apps/web-store-pos/app/sync` — must return no matches. Satisfies SYNC-16.
- [ ] **T-9.5** — Confirm `@zip.js/zip.js` is absent from `package.json` and no import references it anywhere in `app/sync/`. Satisfies CC-3.

---

## Dependency / Parallelism Map

```
T-0.1 → T-0.2 → T-1.1 → T-2.1 → T-2.2 → T-3.1 → T-3.2 → T-3.3 → T-3.4
                                                                         ↓
                                                              T-4.1 → T-4.2 → T-4.3 → T-4.4 → T-4.5
                                                                                                   ↓
                         [PR 1 boundary]                             T-5.1 ─────────────────────→ T-6.1
                                                                                                    ↓
                                                                              T-6.2 → T-6.3 → T-6.4 → T-6.5
                                                                                                          ↓
                                                                              T-7.1 → T-7.2 → T-7.3 → T-7.4 → T-7.5
                                                                                                                    ↓
                                                                                                         T-8.1 → T-9.1 → T-9.2 → T-9.3 → T-9.4 → T-9.5
```

T-3.1/T-4.1 (test stubs) can be written in parallel with their respective GREEN tasks once stubs compile.
T-5.1 is independent of T-4.x and can start after T-4.5 on the Slice 2 branch.
