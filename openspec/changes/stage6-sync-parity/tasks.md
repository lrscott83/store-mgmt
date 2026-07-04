# Tasks: Stage 6 — Sync + PWA Cross-Cutting Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-750 total (Unit A serializer rewrite ~120 + tests ~150; synchronizer rewrite ~150 + tests ~180; wiring ~40; Unit B ~90; Unit C ~110 incl. tests; Unit D ~25) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (by size); delivery pattern is commits-only, no PR/push per session |
| Suggested split | Unit A (serializer+synchronizer, TDD) → Unit C (usage tracker, TDD) → Unit D (SW poll) → Unit B (forms, after A) |
| Delivery strategy | commits-only, no PR/push (hybrid persistence, chained work-unit commits) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

**Fixture decision point (flag before Slice A GREEN):** Unit A needs a real Angular-produced `.zip` fixture for true interop testing. If unavailable, Phase 1.1 defines the accepted fallback parity gate (self round-trip + entry-name/shape assertion). `sdd-apply` MUST resolve this explicitly before starting Phase 2 GREEN tasks — do not silently skip the fixture question.

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type | Dependency |
|------|------|-------------|------------|
| A | Angular-format serializer + domain-validated synchronizer (TDD) | feat | Phase 1 fixture decision first |
| C | Usage-tracker write-side (TDD) | feat | Independent, parallel with A |
| D | SW `registration.update()` 15-min poll | feat | Independent, parallel with A/C |
| B | Sync forms UI kit + password toggle + i18n fallback | fix | After A merges (shares sync contract) |

## Phase 1: Fixture Prerequisite (Unit A.0) — Req: Angular-Compatible Backup Format

- [x] 1.1 Obtain/verify an Angular-produced `.zip` fixture (`angular-export.zip`, exported from `frontend/` with a known password+`selectedStoreId`) for true interop testing. If unavailable, the parity gate is: (a) React round-trips its own zip, (b) assert zip entry names + JSON content shapes match the documented Angular format exactly, using `@zip.js/zip.js` with matching params (default AES-256 AE-2, no explicit `encryptionStrength`) — **RESOLVED per binding decision (engram #645): fallback parity gate used, no real Angular fixture required (feature has no real client; see decision log).**
- [x] 1.2 Confirm `fflate` has no consumers outside `app/sync/lib/services/data-serializer-service.ts` + its test (grep repo-wide) — safe to remove in Phase 4 — **Confirmed via repo-wide grep before AND after rewrite; removed in Phase 4.**

## Phase 2: Unit A — Serializer Rewrite (TDD) — Req: Angular-Compatible Backup Format, Store-Scoped Backup Decryption

- [x] 2.1 RED: add `@zip.js/zip.js` to `apps/web-store-pos/package.json`; rewrite `data-serializer-service.test.ts` — export produces 6 named entries (`categories.json`, `products.json`, `inventory-entries.json`, `orders.json`, `expenses.json`, `sale-credits.json`), each password-AES with `password = userPassword + selectedStoreId` (no separator), no `encryptionStrength` override
- [x] 2.2 RED: same file — import decrypts all 6 entries with matching password+storeId; wrong password/storeId fails with a typed error before any write
- [x] 2.3 GREEN: rewrite `data-serializer-service.ts` — `ZipWriter`/`ZipReader` + `BlobWriter`/`BlobReader` + `TextReader`/`TextWriter` per Angular spec; Map-entry shape for categories/products/inventory-entries, array shape for orders/expenses/sale-credits
- [x] 2.4 GREEN: apply the Phase 1.1 parity gate (real Angular zip or self-round-trip + shape assertion) — must pass before Phase 3
- [x] 2.5 REFACTOR: extract shared entry read/write helpers; run `data-serializer-service.test.ts` green; commit `feat(web-store-pos): rewrite sync serializer to Angular zip.js AES 6-file format` — **commit 3ddf48e**

## Phase 3: Unit A — Synchronizer Rewrite (TDD) — Req: Domain-Validated Import With Abort-and-Revert

- [x] 3.1 RED: `data-synchronizer-service.test.ts` — `categories.json` is processed first regardless of zip entry order
- [x] 3.2 RED: same — duplicate category/product name (`getByName(x).id !== incoming.id`) breaks that entity's merge on the first failed item (iterated sorted by `order`) and reverts the WHOLE type's map to its pre-import snapshot; typed `SyncEntityError` surfaced
- [x] 3.3 RED: same — inventory-entries/orders/expenses/sale-credits: first failed item breaks that file's loop, prior successful writes for that file are NOT reverted; `synchronizeFiles` aggregates errors across files and continues (not abort-on-first)
- [x] 3.4 RED: same — decrypt/parse failure still produces zero writes (existing no-write guarantee unchanged) — **covered by existing `import-no-write.test.ts`, re-verified green post-rewrite, no new test needed (architectural: synchronizer.sync() is never invoked when serializer.import() throws).**
- [x] 3.5 GREEN: rewrite `data-synchronizer-service.ts` — categories-first ordering, name-uniqueness guard via `getByName`, whole-type snapshot+revert for Products/Categories, break-only (no revert) for the other 4 types, `SyncResult { succeeded; errors: SyncEntityError[]; merges: EntityMergeResult[] }`
- [x] 3.6 REFACTOR: dedupe per-type merge loop behind a shared helper parameterized by revert-on-fail; run synchronizer tests green; commit `feat(web-store-pos): restore domain-validated import with per-type revert semantics` — **commit ca7d85e**

## Phase 4: Unit A — Wiring + Cleanup — Req: Angular-Compatible Backup Format

- [x] 4.1 Update `app/sync/routes/export.tsx` and `import.tsx` to the new serializer/synchronizer contracts (`SyncResult`, typed errors) — **export.tsx needed no change (CategoryReader/etc. readers unchanged); import.tsx rewired write-side repos + ImportForm prop type to `SyncResult`.**
- [x] 4.2 Remove `fflate` from `apps/web-store-pos/package.json` (confirmed no other consumers, Phase 1.2); reinstall lockfile
- [x] 4.3 Run full sync test suite + `tsc --noEmit` clean; commit `refactor(web-store-pos): wire sync routes to Angular-format serializer/synchronizer, drop fflate` — **commit 68154b3**

## Phase 5: Unit C — Usage-Tracker Write-Side (TDD, parallel with A) — Req: Daily Store Activity Recording, Buffered POST With Mutex

- [x] 5.1 RED: new `app/shared/lib/usage/__tests__/store-usage-tracker.test.ts` — records today in `lizoft.store-daily-usage-{userId}` on navigation when `user` + `selectedStoreId` present; no-op when unauthenticated or no store selected
- [x] 5.2 RED: same — POSTs only unsaved days to `/v1/usages/store-daily-usage`, marks saved on success, skips POST when zero unsaved days
- [x] 5.3 RED: same — sending mutex blocks a second concurrent POST while one is in flight
- [x] 5.4 GREEN: create `app/shared/lib/usage/store-usage-tracker.ts` mirroring Angular `StoreUsageTrackerService` (registerActivity/sendUsageData/mutex/localStorage buffer keyed by `userId`, reading `useAuthStore.getState().user`)
- [x] 5.5 GREEN: wire a navigation-triggered hook (`use-store-usage-tracker.ts`) invoking the tracker on every route change, mounted from `root.tsx`
- [x] 5.6 REFACTOR: run usage-tracker tests green; commit `feat(web-store-pos): add store usage tracker write-side (nav buffer + POST + mutex)` — **commit 055c75a**

## Phase 6: Unit D — SW Update Polling (tiny, parallel with A/C) — Req: Periodic Update Check

- [x] 6.1 RED: new `app/shared/lib/pwa/__tests__/service-worker-registration.test.ts` — `registration.update()` is invoked on an interval (~15 min, fake timers) after `onRegisteredSW` fires; no-op when no registration exists; `registerServiceWorker()` inert without SW support — **extracted `setupServiceWorker`/`registerServiceWorker` into `app/shared/lib/pwa/service-worker-registration.ts` (dependency-injected `registerSW`) instead of testing `root.tsx` directly, so the interval logic is unit-testable without mocking the `virtual:pwa-register` vite-plugin-pwa virtual module.**
- [x] 6.2 GREEN: `service-worker-registration.ts` — `onRegisteredSW(swUrl, registration)` added to `registerSW()` options; `setInterval(() => registration?.update(), 15 * 60 * 1000)`; `root.tsx` wired to the extracted module
- [x] 6.3 Run tests green; commit `feat(web-store-pos): poll registration.update() every 15 minutes` — **commit 132c144**

## Phase 7: Unit B — Sync Forms UI Kit + i18n (after Unit A merges) — Req: Shared UI Kit Forms, Password Visibility Toggle, Translated Error Fallback

- [x] 7.1 RED: `export-form.test.tsx`/`import-form.test.tsx` — `Card` title `SYNC.EXPORT_TITLE`/`IMPORT_TITLE`, fab `Button` submit, `InfoBox` result/error banners render
- [x] 7.2 RED: same — password field show/hide toggle switches input type text/password
- [x] 7.3 RED: same — unexpected (non-typed) error renders a translated catch-all key, never raw `err.message`
- [x] 7.4 GREEN: `es.ts` — added `SYNC.ERROR_UNEXPECTED`/`SYNC.SHOW_PASSWORD`/`SYNC.HIDE_PASSWORD` keys with Spanish copy
- [x] 7.5 GREEN: rewrote `export-form.tsx`/`import-form.tsx` on `Card`/`Button(fab)`/`InfoBox` + password toggle (`EyeIcon`/`EyeOffIcon`) + translated fallback, wired to the Unit A `SyncResult`/typed-error contract unchanged; `export.tsx`/`import.tsx` routes drop their redundant `<h1>` now that `Card` owns the title
- [x] 7.6 Run sync component tests green; commit `fix(web-store-pos): sync forms UI kit parity + password toggle + i18n error fallback` — **commit df2d21d**

## Phase 8: Full-Suite Regression Gate

- [x] 8.1 Grep-confirm no remaining `fflate` imports, no raw `err.message` in sync forms, no `BaseRepository.upsert` bypass in the synchronizer for products/categories, no `OrdersUnexpectedError` emitted for expenses/saleCredits (fixed bug stays fixed) — **all clean; `mergeWithRevert`'s per-item `repo.upsert()` calls for categories/products are guarded by the name-uniqueness check + whole-type snapshot/revert, not a raw bypass.**
- [x] 8.2 Run full `pnpm test` + `pnpm -C apps/web-store-pos exec tsc --noEmit` clean — **`pnpm test` (turbo): 3/3 tasks successful, web-store-pos 105 files / 1232 tests passed; `tsc --noEmit` clean (0 errors). No residual diffs — folded into the Phase 7 commit (df2d21d) and this doc update, no separate gate commit needed.**
