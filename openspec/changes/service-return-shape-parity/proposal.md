# Proposal: Service Return-Shape Parity (React offline services)

> Renamed from exploration's `service-layer-async-parity`. Rationale: the exploration
> DISPROVED the "convert the whole layer to async" premise. Angular's offline layer is
> NOT uniformly async — it has 4 distinct per-method return shapes. The real work is
> restoring exact per-method RETURN SHAPE (envelope + async-only-where-Observable), not a
> blanket async conversion. The name now describes the actual scope.

## Intent

Restore exact Angular per-method return-shape parity across the React offline service layer.
`offline-online-service-parity` ADR-1 made every offline method PLAIN SYNC and flattened
envelopes (bare values / sentinel throws). That deviates from Angular source, which mixes
four return shapes in the SAME classes. This change corrects the sync + flattening
deviations, mirroring Angular literally (playbook rules 3, 4, 9). Success = each public
method's shape matches its Angular counterpart exactly, with no broken sync↔async or
flattened↔enveloped boundary.

## The 4-category reading (user-ratified, playbook-literal)

| Cat | Angular shape | React today | This change |
|-----|---------------|-------------|-------------|
| A | plain sync value, no envelope (`getActiveOrdersPriceToday(): number`) | matches | leave unchanged |
| B | `BaseResponseModel<T>` SYNC (via `Success(...)`, no Observable) | flattened | restore `BaseResponseModel<T>`, keep SYNC |
| C | `Observable<BaseResponseModel<T>>` (interface + `*Observable` helpers) | sync | `Promise<BaseResponseModel<T>>` (async + envelope) — ONLY category that becomes async |
| D | `Result`/`DataResult` SYNC (`domain/commons/result.ts`: `{data,succeeded,errors}` — DIFFERENT shape than BaseResponseModel) | flattened/throw | restore `Result`/`DataResult` shape, keep SYNC |

Envelope shapes B and D stay DISTINCT — unifying them into one contract is invented
normalization (rule 2) and is NOT done.

## Scope

### In Scope
- 7 offline services: Inventory, Product, ProductCategory, Order, Expense, SaleCredit (+ `BaseService<T>`), their domain interfaces, call-sites, and tests.
- Add/adopt the `Result`/`DataResult` envelope type in React (mirror `domain/commons/result.ts`); React carries BOTH B and D envelope shapes distinctly.
- Remove React-invented aggregation services with NO Angular correlate (`StatisticsAggregationService`, `report-aggregation-service`, `inventory-today-sale-service`) and re-express their logic INLINE, sync, no envelope — mirroring Angular's inline `OrderOfflineService.getLastMonthSaleProfits/getLastMonthSales`.
- Supersede `offline-online-service-parity` ADR-1 on BOTH counts (sync choice AND flatten/sentinel-throw choice) for B/C/D methods. Committed Slices 1-2 get follow-up conversion, not clean rewrite.

### Out of Scope
- `product-service-parity` exact-surface Product/Category work — PAUSED; resumes AFTER, on this corrected base.
- `offline-online-service-parity` Slices 4-6 (auth/admin/infra) unless they carry the same flattening.
- Any real async I/O — `BaseRepository` stays synchronous localStorage; category-C Promises are same-tick "fake async" mirroring Angular.

## Per-service categorization (from exploration)

| Service | A (leave) | B (sync envelope) | C (→async) | D (Result/DataResult sync) |
|---------|-----------|-------------------|------------|-----------------------------|
| Inventory (leaf) | cost/query helpers | `getInventoryCategoriesView`, `getInventoryEntriesInDay` | `getInventoryEntriesView`, `filterInventoryEntries`, `getInventoryEntriesInDayObservable`, `getInventoryCategoriesViewObservable` | `create/update/amortizeSold/deleteInventoryEntry`, `isNotSoldEntry`, `hasAvailableProductToSale`, `increaseQuantitiesByOrderItems`, `addImportedEntries`, `updateImportedEntries` |
| Product | — | — | ALL interface methods (Observable by contract) | — |
| Expense (leaf) | `getExpensesTotal` | `getExpensesInDay` | `getExpensesInDayObservable`, `filterExpensesObservable` | `create/update/deleteExpense`, `addImportedExpense`, `updateImportedExpense` |
| SaleCredit (leaf) | `getSaleCreditsTotalBefore` | `getSaleCreditsInDay` | `getSaleCreditsInDayObservable`, `getUnPaidSaleCreditsInDayObservable`, `getPaidSaleCreditsInDayObservable`, `getSaleCreditsObservable`, `filterSaleCredits` | `create/update/paid/deleteSaleCredit`, `deactivateSaleCreditByOrderId`, `addImportedSaleCredit`, `updateImportedSaleCredit` |
| ProductCategory | — | — | ALL interface methods (Observable by contract) | — |
| Order (deepest) | `getActiveOrdersPriceToday`, `getOrderById`, `getLastMonthSale*` | `getCategoryCartItemsView` | `createOrder`, `getActiveTodayOrdersObservable`, `filterOrdersObservable`, `getCategoryCartItemsViewObservable` | `activate/deactivateOrder`, `updateTodayOrder`, `add/updateImportedOrder` |

Corrected from exploration's original reading: Expense and SaleCredit each have category-C methods
(Angular `Observable<BaseResponseModel<T>>`), verified directly against
`expense-offline.service.ts:93,97` and `sale-credit-offline.service.ts:122,126,134,145` — the
exploration's "no async methods" claim for these two services was wrong. Inventory's C/D columns
also gained `getInventoryCategoriesViewObservable` (`inventory-offline.service.ts:260`) and
`addImportedEntries`/`updateImportedEntries`, previously omitted. Order/Product/ProductCategory
were already correct. Expense and SaleCredit remain dependency-order LEAVES (nothing calls into
them except Order) — only their slice SIZE grows to cover the new C conversions and their
call-sites; the slicing order below is unchanged.

## Capabilities

### New Capabilities
- `offline-service-return-shapes`: the per-method return-shape contract (A/B/C/D) for the 7 React offline services mirroring Angular source.

### Modified Capabilities
None (no existing `openspec/specs/` capability governs the POS offline services).

## Approach

Precedent to copy for category C: the existing async+enveloped `*-http-service.ts` online
layer already uses `BaseResponseModel<T>` correctly. Slice per service in DEPENDENCY ORDER
so a sync service never calls a now-async one:

1. **Inventory** (leaf)
2. **Product**, **Expense**, **SaleCredit** (leaves)
3. **ProductCategory** (calls Product)
4. **Order** (calls SaleCredit + ProductCategory + Inventory — last core)
5. **Aggregation layer** — remove the no-correlate services, inline into consumers

Each slice restores that service's B/D envelopes + converts its C methods to async, updates
ITS call-sites and ITS tests, leaving no broken boundary. Strict TDD: every method RED→GREEN.

## Call-site impact (from exploration inventory)

~15 non-test consumer files + 5 cross-service coupling files; 33 files / 102 `new XOfflineService(` occurrences.
- **Category C consumers** become `await` inside async IIFE/handler; handlers that branch synchronously on the return (e.g. `cart-shell.tsx:115-120` add-to-cart validation) need re-sequencing.
- **Category B/D consumers** add envelope-unwrap (`.data`) but stay SYNC.
Exact per-method call-site enumeration is deferred to sdd-tasks.

## Suspected bugs / open ambiguities — RESOLVED in design (ADR-1, ADR-6, ADR-7)

| # | Item | Resolution |
|---|------|-----|
| 1 | `extends BaseService` (deferred in offline-online design-slice1) — its shape is coupled to the envelope decision | RESOLVED (design ADR-1): stays a SYNC React-only seam, OUTSIDE the A/B/C/D conversion. Angular's `BaseService` HTTP CRUD is `Observable`-based, but none of the 7 offline services ever call it — they only use the envelope factories `this.Success()`/`this.Success$()`. Forcing it async would invent a contract Angular's offline layer never had. |
| 2 | `BaseRepository` is 100% sync localStorage — category-C Promises are same-tick fake async | RESOLVED (design ADR-7): in-scope as pure signature parity (no real I/O); no repository change. |
| 3 | Aggregation removal — inline re-expression may duplicate logic across 2+ consumer components | RESOLVED (design ADR-6): inline re-expression, mirroring Angular's own inline aggregation; mild duplication accepted, no shared helper invented. |

No NEW ambiguity beyond the exploration's flags; the async-scope ambiguity is RESOLVED (category C
only), and ambiguities #1-#3 are RESOLVED by source-backed design decisions (no user sign-off
required to proceed — see design.md ADRs 1, 6, 7).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/**/services/*-offline-service.ts` (6) | Modified | Restore B/D envelopes, convert C to async |
| `packages/domain/src/services/base-service.ts` | Kept, no code change | Per design ADR-1: stays a SYNC React-only seam, OUTSIDE the conversion; doc-note added only |
| `packages/domain/src/interfaces/{product,product-category}.service.ts` | Modified | C methods → `Promise<BaseResponseModel<T>>` |
| `packages/domain/src/commons/result.ts` | New | Mirror Angular `Result`/`DataResult` (category D) |
| `app/statistics/lib/services/*aggregation*.ts`, `inventory-today-sale-service.ts` | Removed | Inline into consumers |
| ~20 consumer files + ~393 test blocks | Modified | await (C) / unwrap (B/D); envelope assertions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sync↔async boundary break mid-slicing | High | Strict dependency order; each slice self-contained + green tests |
| Reworking committed Slices 1-2 misses a flattened method | Med | Category audit per method before conversion; verify phase cross-checks |
| Test rework volume (~393 blocks) inflates PR size | High | Chained PRs per service slice; forecast in sdd-tasks |
| Unifying B and D by accident | Med | Keep two distinct TS types; assert shape in tests |
| Aggregation inline duplication drifts from Angular | Low | Mirror Angular inline logic verbatim, per design ADR-6's resolution |

## Rollback Plan

Each service is an independent slice/PR in dependency order. Revert the offending slice's PR;
earlier merged slices stay valid because each leaves a consistent boundary (its consumers were
migrated in the same slice). `Result`/`DataResult` type addition is additive and safe to keep.

## Dependencies

- Exploration `sdd/service-layer-async-parity/explore` (read).
- Playbook `docs/migration/playbook-migracion-servicios-angular-react.md` (rules 2,3,4,9,10).
- Supersedes `offline-online-service-parity` ADR-1; blocks `product-service-parity` (resumes after).
- Strict TDD active.

## Fixed Decisions

1. **4-category reading**: async ONLY for category C (Angular Observable); A/B/D stay sync.
2. **Restore both envelope shapes DISTINCTLY**: `BaseResponseModel<T>` (B/C) and `Result`/`DataResult` (D) — no unification.
3. **Remove no-correlate aggregation services**, re-express inline mirroring Angular.
4. **Supersede offline-online ADR-1** on both counts (sync AND flatten/sentinel-throw) for B/C/D methods.

## Success Criteria

- [ ] Every public offline method's return shape matches its Angular counterpart (A/B/C/D verified per method).
- [ ] Category C methods return `Promise<BaseResponseModel<T>>`; B/D restore exact envelopes SYNC; A unchanged.
- [ ] `Result`/`DataResult` and `BaseResponseModel<T>` coexist as distinct types.
- [ ] No-correlate aggregation services removed; logic inlined mirroring Angular.
- [ ] No broken sync↔async / flattened↔enveloped boundary; all tests green (RED→GREEN per method).
- [ ] Ambiguities #1–#3 resolved per design ADR-1/ADR-6/ADR-7 (source-backed, no user sign-off blocking); dependent slices proceed on those resolutions.
