# Design: Service Return-Shape Parity (React offline services)

## Technical Approach

Restore Angular's exact per-method return shapes across the 7 React offline services using the user-ratified 4-category reading (A plain-sync, B `BaseResponseModel` sync, C `Observable`→`Promise` async+envelope, D `Result/DataResult` sync). Conversion targets each service's own Angular-mirrored methods — NOT a blanket async migration. Supersedes offline-online ADR-1 (sync + envelope-flatten + sentinel-throw) for B/C/D only. Repository stays sync localStorage; C is same-tick fake async (pure signature parity). Delivered as dependency-ordered slices, each self-contained (service + its call-sites + its tests), strict TDD RED→GREEN per method.

## Architecture Decisions

### ADR-1: `BaseService<T>` shape — RESOLVED (Ambiguity #1)

**Choice**: React's `BaseService<T>` interface stays a SYNC React-only seam (`getAll/getById/delete`). It is NOT converted to async and is OUTSIDE the category conversion.

**Evidence**: Angular's `BaseService<T>` HTTP CRUD (`getAllItems/getItemById/create/update/delete/...`) is all `Observable` (category C) — but the offline services that `extends BaseService` NEVER call it. Those methods hit `environment.apiUrl` (the ONLINE path). `InventoryOfflineService` uses the base ONLY for the envelope factories `this.Success()` (l.223,257,314) and `this.Success$()` (l.394); it never invokes `getAllItems/create/...`. Each offline service defines its OWN domain methods (`createInventoryEntry`, `filterInventoryEntries`, ...).

**Rationale**: Angular's Observable base CRUD is the online surface; its faithful React equivalent ALREADY exists as the async+enveloped `*-http-service.ts` layer (e.g. `user-http-service.ts`). React's offline `getAll/getById/delete` (asserted sync in `base-service.test.ts`) have NO Angular offline correlate — forcing them async would invent a contract Angular never had offline (rule 2). Category A/B/C/D applies to the Angular-mirrored offline methods, not to this seam.

**Rejected**: making `BaseService<T>` async (mechanically "C") — mistakes the online HTTP contract for the offline one, breaks every sync consumer with no Angular justification.

### ADR-2: 4-category conversion mechanics

**Choice**: Port the envelope factories, then convert per method.

| Cat | Angular | React mechanic |
|-----|---------|----------------|
| A | plain sync value | untouched |
| B | `this.Success(x)` → `BaseResponseModel<T>` sync | wrap existing sync body in `success(x)` |
| C | `this.Success$(x)` → `Observable<BaseResponseModel<T>>` | `return Promise.resolve(success(x))` (same-tick); failures `Promise.resolve(failure(errors))` |
| D | `Result/DataResult` sync | wrap in `Result.Success/DataResult` |

**Precedent (C)**: `*-http-service.ts` already returns `Promise<BaseResponseModel<T>>` async+enveloped — mirror its shape offline, minus real I/O.

**Rationale/correction**: Angular's `Success$`/`Failure$` both use `of(...)` — they RESOLVE (never `throwError`). So C failures RESOLVE a `succeeded:false` envelope; they do NOT `Promise.reject`. Rejection would only mirror an Observable using `throwError`, which the base does not. Faithful = resolve.

### ADR-3: `Result`/`DataResult` type

**Choice**: Port `domain/commons/result.ts` verbatim to `packages/domain/src/commons/result.ts`; keep DISTINCT from `BaseResponseModel`. No unification of B and D.

**Rationale**: Different shapes (`{succeeded,errors}` / `{data,succeeded,errors}` vs `{data,succeeded,message,actionCode,errors}`). Unifying = invented normalization (rule 2). Two distinct types + shape assertions guard against accidental merge.

### ADR-4: Dependency-ordered slicing

**Choice**: `1 Inventory → 2 {Product, Expense, SaleCredit} → 3 ProductCategory → 4 Order → 5 aggregation (remove+inline)`.

**Rationale**: Order = reverse dependency. Inventory is a leaf; Order depends on SaleCredit+ProductCategory+Inventory, so it converts last once its dependencies' shapes are final. Each slice migrates a service AND its call-sites AND its tests together, so no sync↔async boundary is ever half-converted across a slice edge. Rollback = revert one slice; earlier slices remain valid.

**Correction (categorization, no reorder)**: Expense and SaleCredit both carry category-C methods
(`expense-offline.service.ts:93,97`; `sale-credit-offline.service.ts:122,126,134,145`) — the
exploration wrongly read them as C-free. This does NOT change the slicing order: nothing calls
INTO Expense or SaleCredit except Order, so both remain step-2 leaves. It only grows their slice
SIZE (each slice now also converts its C methods to async and re-sequences their call-sites),
same as Inventory's step-1 slice already accounted for its own C methods.

### ADR-5: Call-site conversion pattern

**Choice**: C consumers → sync handler becomes async (`await` inside the handler/effect/IIFE); B/D consumers → add `.data` (or `.succeeded/.errors`) unwrap, stay sync.

Branch-on-result pattern (`cart-shell.tsx:115-120`, `handleQuantityChange`): the methods it calls (`productService.getById`, `inventoryService.getAvailableQuantity`) are category-A sync → this site STAYS sync unchanged. Only sites calling a method that becomes C re-sequence, e.g.:

```ts
// C consumer: was `const r = svc.getInventoryEntriesView();`
const r = await svc.getInventoryEntriesView();      // Promise<BaseResponseModel<...>>
if (!r.succeeded) { showBlockingError(...); return; }
use(r.data);
```

Handlers that gain `await` become `async`; React event handlers can be async without signature change.

### ADR-6: Aggregation inline re-expression (Ambiguity #3)

**Choice**: RECOMMEND INLINE (compliant). Delete `statistics-aggregation-service`, `report-aggregation-service`, `inventory-today-sale-service` (+ tests) — they have NO Angular correlate. Re-express their logic INLINE in the real Angular-corresponding container.

**Consumer absorption**:
- `report-aggregation-service` + `inventory-today-sale-service` → inline into `reports/routes/today-report.tsx` (and `inventory-today-sale-pdf.ts` keeps its own inline compute).
- `statistics-aggregation-service` → inline into `statistics/routes/dashboard.tsx`; charts (`profit-chart`, `sales-chart`, `chart-core`) stay presentational, receiving computed props — mirrors Angular's single inline-computing container (no 4-way duplication).

**Tradeoff**: mild duplication if two containers need the same reduce; acceptable and Angular-faithful (Angular aggregates inline, e.g. `OrderOfflineService`). Escalate only if a shared consumer genuinely can't mirror Angular — none found.

### ADR-7: `BaseRepository` sync / fake-async (Ambiguity #2)

**Choice**: NO repository change. `BaseRepository` stays 100% sync localStorage. Category-C Promises are same-tick (`Promise.resolve`), no real I/O — pure signature parity mirroring Angular's `of(...)` over synchronous storage reads.

## Data Flow

    localStorage (sync)
        │
    Repository.getAll (sync)        ← unchanged
        │
    OfflineService method
        ├─ A → value          (sync)
        ├─ B → success(data)  (BaseResponseModel, sync)
        ├─ C → Promise.resolve(success(data))  (same-tick async)
        └─ D → Result/DataResult (sync)
        │
    Call-site: sync unwrap (.data) OR await (C)
        │
    Zustand store / React component state

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/domain/src/commons/result.ts` | Create | Port Angular `Result`/`DataResult`, distinct from `BaseResponseModel` |
| `packages/domain/src/commons/envelope.ts` | Create | `success/failure` (sync `BaseResponseModel`) + `successAsync/failureAsync` (Promise) mirroring `Success/Success$/Failure/Failure$` |
| `packages/domain/src/services/base-service.ts` | Keep | Sync seam unchanged (ADR-1); doc-note: React-only, no Angular offline correlate |
| `inventory-offline-service.ts` | Modify | Restore B/D envelopes; convert C (`getInventoryEntriesView`, `filterInventoryEntries`, `getInventoryEntriesInDayObservable`, `getInventoryCategoriesViewObservable`) to Promise; D gains `addImportedEntries`, `updateImportedEntries`; keep A |
| `expense-offline-service.ts` | Modify | Restore B/D envelopes; convert C (`getExpensesInDayObservable`, `filterExpensesObservable`) to Promise; D gains `addImportedExpense`, `updateImportedExpense`; keep A |
| `sale-credit-offline-service.ts` | Modify | Restore B/D envelopes; convert C (`getSaleCreditsInDayObservable`, `getUnPaidSaleCreditsInDayObservable`, `getPaidSaleCreditsInDayObservable`, `getSaleCreditsObservable`, `filterSaleCredits`) to Promise; D gains `deactivateSaleCreditByOrderId`, `addImportedSaleCredit`, `updateImportedSaleCredit`; keep A |
| `product` / `product-category` / `order` `-offline-service.ts` | Modify | Same per-category conversion + call-sites + tests, per slice |
| ~15 non-test call-sites + 5 cross-service files | Modify | C → `await`; B/D → `.data`/`.succeeded` unwrap |
| `statistics-aggregation-service.ts`, `report-aggregation-service.ts`, `inventory-today-sale-service.ts` (+ tests) | Delete | No Angular correlate — inline into containers (ADR-6) |
| `statistics/routes/dashboard.tsx`, `reports/routes/today-report.tsx` | Modify | Absorb removed aggregation inline, mirroring Angular |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Per-method return SHAPE (envelope vs value vs Result; sync vs Promise) | Strict TDD RED→GREEN; shape assertions distinguishing `BaseResponseModel` from `Result/DataResult` |
| Unit | Category-C same-tick resolution + `succeeded:false` on failure (no reject) | `await expect(...).resolves` |
| Integration | Cross-service slices (Order→SaleCredit/ProductCategory/Inventory) | Per-slice call-site tests migrated in same slice |
| Regression | ~393 existing test blocks reworked per slice | Rework within the owning slice only |

## Migration / Rollout

Chained/stacked PR per slice in dependency order (test volume + line budget). Each slice is atomic and independently revertible; `result.ts`/`envelope.ts` additions are additive/safe. No data migration.

## Open Questions

- None blocking. Ambiguities #1 (resolved: sync seam, ADR-1), #2 (resolved: no repo change, ADR-7), #3 (resolved: inline, ADR-6). Exact per-method call-site enumeration is deferred to sdd-tasks (mechanical), not a design blocker.
