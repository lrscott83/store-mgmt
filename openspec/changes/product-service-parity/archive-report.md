# Archive Report — product-service-parity

**Change**: product-service-parity (Product/ProductCategory service Angular→React parity, branch `feat/frontend-parity-audit`)
**Status**: ARCHIVED — Change is complete, verified, and closed.
**Date Archived**: 2026-07-09
**Artifact Store**: hybrid (Engram + openspec filesystem)

## Verification Summary

**Verdict**: PASS — whole-change fresh-context verify (engram #830), 0 CRITICAL, 0 WARNING, 0
SUGGESTION. All prior per-phase/per-slice verifies (Phase 1, Slice 5, Slice 8 #817, step 9 #826)
were re-judged, not trusted, as part of the whole-change pass. Gates green: domain 95/95 tests,
`tsc --noEmit` clean, build clean; web-store-pos 1541/1541 tests (112 files), `tsc --noEmit`
clean, build clean (client + SSR + PWA/service-worker + SPA).

## Artifacts Persisted (Engram, with observation IDs for traceability)

| Artifact | Observation ID | Topic Key |
|----------|---|---|
| Proposal | 699 | sdd/product-service-parity/proposal |
| Spec (Exact-Surface Rule reconciliation) | 700 | (topic: Product-service-parity: Exact-Surface Rule reconciliation) |
| Design (exact-surface decisions) | 701 | (topic: Product-service-parity: exact-surface design decisions) |
| Design (A/B/C/D fold-in reconciliation) | 748 | sdd/product-service-parity/design fold-in reconciliation |
| Tasks (LAYER-FIRST regeneration, Phase 1) | 751 | sdd/product-service-parity/tasks |
| Tasks Slice 1 (superseded stub) | 708 | Product-service-parity: Slice 1 tasks regenerated |
| Tasks Slice 5 | 760 | sdd/product-service-parity/tasks-slice5 |
| Tasks Slice 6 (ratified flags reconciliation) | 769 | Reconciled Slice 6 tasks file with ratified flags (#771) |
| Tasks Slice 7 | 785 | sdd/product-service-parity/tasks-slice7 |
| Tasks Slice 8 | 789 | sdd/product-service-parity/tasks-slice8 |
| Verify Report — whole-change (final gate) | 830 | sdd/product-service-parity/verify-report-whole-change |
| Archive Report | (this) | sdd/product-service-parity/archive-report |

Additional binding-decision engram entries referenced across the chain: #639 (sync precedent,
not this change), #756/#758 (apply-progress, ProductRepository mandatory-DI step 9), #761
(Slice 5 Flag #1 ratification), #771 (Slice 6 5-flag ratification), #817 (Slice 8 prior
per-slice verify), #826 (step 9 prior per-step verify).

## Specs Synced

**Domain**: `product-service` (NEW capability — no prior main spec existed for this domain)
**Action**: Created new canonical spec at `openspec/specs/product-service/spec.md`
**Source**: `openspec/changes/product-service-parity/spec.md` (the full ratified spec, not a
delta — copied and lightly re-framed for capability-level presentation, matching the
`stage6-sync-parity` archive precedent: title changed from a change-scoped title to a
capability-scoped title; process-only "this is a NEW capability" framing and per-slice tracking
references removed; two structural facts updated to reflect the FINAL as-built state rather than
the in-flight planning state:
  1. `ProductCategoryRepository.activateProductCategory`/`deactivateProductCategory` documented as
     1-param (React fixed Angular's dead 2nd param, per angular-bugs-policy — Phase 1 WU1.9).
  2. `ProductRepository`'s constructor documented as MANDATORY `ProductCategoryRepository` (Phase
     2 step 9, commit `0afb789`, tightened from the Phase-1 optional-with-default).
- ALL 19 Requirements + their Scenarios preserved verbatim (Service Method Signature Parity,
  Offline-Only Public Methods, Online createProduct Omits Barcode, Async Contract,
  Error-Envelope Contract, Category-Exists/Barcode-Uniqueness/Name-Uniqueness Validation,
  Order-Shift, Soft-Delete Semantics, Repository-Only Activate/Deactivate,
  setDiscountFromInvantory, hasAnyAvailableToSaleProduct, getProductsToSelect,
  getProductsByCategoryId, getProductsToSaleByCategoryId, createProducts, createCsvProducts,
  Repository-vs-Service Ownership Boundary, ProductRepository Depends on
  ProductCategoryRepository, Category Service Method Surface Parity,
  ProductCategoryRepository Mirrors Angular Repo Surface, Offline/Online DI Selection,
  Call-Site Parity) plus the "Surface Reconciliation" authoritative tables (REMOVE/ADD lists) and
  the "BaseService-level extends — RETIRED" section.
- Added a closing "Out of Scope" section (matching the `sync` spec's convention) naming the
  cross-cutting `BaseService<T>` seam (owned by `service-return-shape-parity`) and the 4 mirrored
  Angular bug-suspect seams (order double-assign, `getProductsToSaleByCategoryId` double-filter,
  `createProducts`/`createCsvProducts` empty-errors-array, online double-slash URLs) as explicitly
  NOT fixed here.

**File Created**: `openspec/specs/product-service/spec.md` (NEW)

## Archive Contents (Preserved in openspec/changes/, in-place — matches repo precedent)

Following the archival convention established by `stage6-sync-parity` and all prior changes
(`audit-user-threading`, `management-users-parity`, `admin-features-parity`, etc.) — there is no
`openspec/changes/archive/` directory in this repo; the change folder remains in place under
`openspec/changes/` for reference and audit trail, with this archive-report.md added:

- `openspec/changes/product-service-parity/proposal.md` ✅
- `openspec/changes/product-service-parity/spec.md` ✅ (source of the merged canonical spec)
- `openspec/changes/product-service-parity/design.md` ✅
- `openspec/changes/product-service-parity/tasks-phase1-repo-di.md` ✅ (Phase 1, 4 WUs, COMPLETE)
- `openspec/changes/product-service-parity/tasks-slice1.md` / `tasks-slice1-category.md` /
  `tasks-slice2-product.md` ✅ (SUPERSEDED stubs — kept for historical record, superseded by the
  LAYER-FIRST re-slicing; explicitly marked "do not use for implementation" in-file)
- `openspec/changes/product-service-parity/tasks-slice5-productcategory-service.md` ✅ (Phase 2
  step 5, COMPLETE)
- `openspec/changes/product-service-parity/tasks-slice6-product-service.md` ✅ (Phase 2 step 6,
  COMPLETE)
- `openspec/changes/product-service-parity/tasks-slice7-product-online-factory.md` ✅ (Phase 2
  step 7, COMPLETE, Flag A files-only ratified)
- `openspec/changes/product-service-parity/tasks-slice8-cleanup.md` ✅ (Phase 2 step 8 + step 9,
  COMPLETE — largest/most cross-cutting slice, all 3 ratification flags resolved)
- `openspec/changes/product-service-parity/archive-report.md` ✅ (this file)

## Source of Truth Updated

The main spec at `openspec/specs/product-service/spec.md` now reflects the complete Product +
ProductCategory service domain: 12-method async `ProductService` (offline + online, DI-switched),
5-method async `ProductCategoryService`, dedicated `ProductRepository`/`ProductCategoryRepository`
with full business-rule ownership (validations, order-shift, soft-delete, repo-only
activate/deactivate), the Exact-Surface Rule enforcement (9 REMOVED React-only methods, 10 ADDED
Angular-parity methods across both services), and the 4 mirrored ANGULAR-BUG-SUSPECT seams
documented as intentionally unfixed.

## Full Slice/Step → Commit Ledger

### Phase 1 — Repository + DI foundation (SYNC, cross-cutting)
| WU | Commit | Note |
|----|--------|------|
| WU2 (ProductCategoryErrors, sequenced first) | `b00ea1b` | feat(domain): port ProductCategoryErrors (byte-identical Angular parity) |
| WU1 (ProductCategoryRepository) | `8416a75` | feat(web-store-pos): extract ProductCategoryRepository (mirror Angular repo surface, no upsert/remove) |
| WU3 (extend ProductRepository) | `971819a` | feat(web-store-pos): extend ProductRepository with validations, order-shift, soft-delete, activate/deactivate |
| WU4 (re-point report/inventory reads) | `100b904` | refactor(web-store-pos): re-point report/inventory reads to SYNC ProductRepository/ProductCategoryRepository (Angular DI parity) |

### Phase 2, Slice 5 — ProductCategoryOfflineService (async category C)
| WU | Commit |
|----|--------|
| WU1 (interface async surface) | `23f3f38` |
| WU2 (offline service reconciliation) | `45b3571` |
| WU3 (products.tsx re-expression) | `9c57b35` |
| doc-fix (design.md step-timing reconciliation) | `2ef9276` |

### Phase 2, Slice 6 — ProductOfflineService (12+2 async surface)
| WU | Commit |
|----|--------|
| WU1 (interface + models, earlier session) | `2898d62` |
| WU3+WU4 (async surface + removals + products.tsx) | `704b125` |
| WU5 (cart-shell.tsx) | `9ece02f` |
| WU6 (user-home.ts) | `001677a` |
| WU7 (edit-inventory-entry-modal.tsx) | `dc22b50` |

### Phase 2, Slice 7 — ProductOnlineService + factory (Flag A: files-only)
| WU | Commit |
|----|--------|
| WU1 (ProductOnlineService) | `07c0725` |
| WU2 (product-service.factory.ts) | (same-session commit, doc-recorded in tasks-slice7.md) |

### Phase 2, Slice 8 — Cleanup (largest slice, all coexistence scaffolding retired)
| WU | Commit | Subject |
|----|--------|---------|
| (pre) factory | `0841792` | add createProductService factory |
| WU7 products.tsx | `9032140` | re-express products.tsx loadData (getProductCategoriesView + per-category) |
| WU8 sale.tsx | `ad7fc5e` | re-express sale.tsx to category-scoped async surface |
| WU9 egress.tsx | `b0ed531` | re-express egress.tsx to category-scoped async surface |
| WU10 available.tsx | `dd9e327` | re-express available.tsx to async getProductCategories + per-category |
| WU8 test-gap fix | `ae68317` | add async methods to sales-routes smoke mocks |
| WU11 data-serializer | `5c3a7d9` | re-point DataSerializerService to repositories (Flag #2) |
| WU12 order-offline | `bb966be` | re-point OrderOfflineService.getCategoryCartItemsView |
| WU13 factory rewire (3 sites) | `7c53b28` | rewire cart-shell/user-home/edit-inventory-entry-modal to factory |
| WU13b factory rewire (4 routes) | `3f7bd4c` | route products/sale/egress/available through factory |
| WU1 ProductService trim | `40fa5aa` | drop extends BaseService<Product> + sync getByBarcode/update |
| WU2 ProductCategoryService trim | `5a9d355` | drop extends BaseService<ProductCategory> (Flag #3) |
| WU3 alias retire | `12069d4` | retire AsyncProductService alias |
| WU4 remove product sync bodies | `5edbda6` | remove ProductOfflineService dead sync surface |
| WU5 remove category sync bodies | `dc4ae4a` | remove ProductCategoryOfflineService dead sync surface (Flag #3) |

### Phase 2, Step 9 — ProductRepository mandatory DI (final step)
| Step | Commit |
|------|--------|
| Tighten `categoryRepository` param to mandatory (18 call-site files + repository itself) | `0afb789` |

## Ratified Flag Resolutions (historical record)

- **Slice 5 Flag #1** (engram #761): KEEP `extends BaseService` + `getAll`/`getById`/`delete`
  alive through Slice 5; drop deferred to step 8.
- **Slice 6 Flags #1-#5** (engram #771, all ratified 2026-07-08): Flag #1 KEEP sync surface this
  slice; Flag #2 DROP React-only CSV barcode column (byte-identical `CsvProduct`); Flag #3
  hardcode `discountFromInvantory: true`; Flag #4 DROP Category display field in
  edit-inventory-entry-modal, swap to `getProductsToSelect()`; Flag #5 `sale.tsx`/`egress.tsx`
  stay OUT of scope (deferred to step 8).
- **Slice 7 Flag A/B**: Option A (files-only) ratified 2026-07-09 — `ProductOnlineService` +
  factory created with ZERO call-site rewiring; all rewiring deferred to step 8. Flag C
  (`AsyncProductService` narrower-type alias workaround) accepted as the correct TS mechanism.
  ANGULAR-BUG-SUSPECT #5 (double-slash URLs on 8/12 online endpoints) mirrored verbatim.
- **Slice 8 Flag #1** (BLOCKING, resolved): the 4 routes (products/sale/egress/available) had no
  async "flat getAll" bridge available — each was re-expressed per its own Angular-source-grounded
  design (category-scoped async fetches). No bridge method invented. One accepted behavior
  narrowing in `available.tsx` (isActive-only vs. previously all-products) — ratified 2026-07-09,
  locked by a regression test (commit `9d28f31`), since neither old nor new `available.tsx` is
  true Angular parity anyway (Angular's real component doesn't use ProductService/CategoryService
  here at all — out of this SDD's scope).
- **Slice 8 Flag #2** (confirmed by source): `DataSerializerService` re-pointed to
  `ProductRepository`/`ProductCategoryRepository` with raw `getCategoriesJson()`/
  `getProductsJson()` pass-through (more Angular-faithful than the prior re-derived
  implementation). One angular-bugs-policy FIX layered in: a `?? '[]'` null-guard, since Angular's
  own unguarded `null` would corrupt a never-synced-store export (confirmed Angular-own latent
  bug, not mirrored).
- **Slice 8 Flag #3** (factual correction, ratified): design.md's premise that Angular's category
  interface has "no delete correlate" was incomplete — Angular's inherited `delete` DOES have a
  real call site (`products.component.ts:89`) but is non-functional in Angular's own offline mode
  (fires a live HTTP call even offline). React's local `delete` override has zero call sites
  (feature never ported). DROP proceeded as planned, correction recorded for the historical
  record.

## Angular-Bugs-Policy Applications (mirrored vs. fixed, final record)

**Mirrored (do NOT fix, locked by tests):**
1. `createProducts`/`createCsvProducts` partial-failure → `Failure$([])` empty errors array.
2. `ProductRepository.updateProduct`/`addProductData` redundant order double-assign after shift.
3. `getProductsToSaleByCategoryId` redundant second `.filter(availableToSale)`.
4. Online `createProduct` omits `barcode` from payload (asymmetric vs. `updateProduct`).
5. Online `ProductOnlineService` double-slash URL artifacts on 8/12 endpoints
   (`Products//...`), single-slash on `getProductByBarcode`/`createCsvProducts`/`createProduct`/
   `createProducts`.

**Fixed (genuine defects, NOT mirrored):**
1. `ProductCategoryRepository.activateProductCategory`/`deactivateProductCategory` — Angular's
   dead 2nd `isActive` param removed; React declares 1-param.
2. `DataSerializerService.getCategoriesJson()`/`getProductsJson()` — added `?? '[]'` null-guard;
   Angular's unguarded `null` would corrupt a never-synced-store export.

## Key Architectural Decisions

- **LAYER-FIRST re-slicing** (design.md, user-ratified 2026-07-08): repository/DI foundation
  built entirely SYNC first (Phase 1), THEN per-service async return-shape migration (Phase 2,
  one service at a time) — supersedes the earlier per-service (category-first) slicing, which hit
  cross-service churn ("service X can't close because repo Y isn't ready").
- **Additive coexistence migration**: the new async Angular-named surface was added ALONGSIDE
  existing sync methods at each slice boundary; the dead sync surface was removed only in the
  final cleanup slice (step 8) — kept every intermediate commit green.
- **Return-shape classification fold-in**: Product + ProductCategory are 100% category C per
  `service-return-shape-parity`'s A/B/C/D taxonomy — this change delivered that classification as
  part of its exact-surface work in one combined pass, retiring the proposal's stale "async both
  sides" framing as a separate decision.
- **Exact-Surface Rule** (non-negotiable, spec.md): React public method surface = Angular public
  methods EXACTLY per layer; no invented bridge methods; 9 React-only methods REMOVED across both
  services, 10 Angular methods ADDED, verified zero-drift by the whole-change verify pass.

## SDD Cycle Complete

This change is now fully **planned → specified → designed → implemented → verified → archived**.
The `product-service` capability spec is closed with full Angular interoperability (offline +
online, DI-switched), complete repository-owned business rules, and zero remaining coexistence
scaffolding. Ready for the next stage of the `feat/frontend-parity-audit` effort.

---

**Archive Decision**: Change folder remains in `openspec/changes/product-service-parity/` (not
moved to an `archive/` subfolder) — this repo has no `openspec/changes/archive/` directory;
precedent (`stage6-sync-parity` and all prior archived changes) keeps the change folder in place
with an in-folder `archive-report.md`, relying on Engram observation IDs for permanent
traceability.

**Next**: No follow-up changes required for this capability. The cross-cutting generic
`BaseService<T>` seam for the OTHER offline services (Inventory, Order, Expense, SaleCredit)
remains owned by `service-return-shape-parity` (separate SDD chain, previously paused).
