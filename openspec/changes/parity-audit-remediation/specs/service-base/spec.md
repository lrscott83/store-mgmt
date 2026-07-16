# Delta for Service Base

## ADDED Requirements

### Requirement: Domain-Level BaseService<T> Is Reproduced (Angular's Real HTTP Base)
This ADDS a SEPARATE, previously-absent abstraction: a reproduction of Angular's actual
`_services/base.service.ts` `BaseService<T>` — the generic HTTP + reactive-state class that
`ProductService`/`ProductCategoryService` (and, in Angular, several other domain services)
literally `extends`. This is DISTINCT from the offline-service storage-accessor base described
elsewhere in this spec ("No Shared Offline Service Base") — that decision covers `getStorageX()`
persistence helpers on the 4 apps-level offline services (Expense/Order/SaleCredit/Inventory) and
REMAINS CORRECT, UNCHANGED, and OUT OF SCOPE here. `packages/domain` MUST export an abstract
`BaseService<T>` exposing, at minimum: reactive getters `items$`, `isLoading$`, `isFirstLoading$`,
`errorMessage$` (Angular: `BehaviorSubject`-backed observables — React MAY implement the equivalent
reactive primitive idiomatically, e.g. a store/observable substitute, provided the four named
surfaces are readable); generic HTTP CRUD `create`, `getAllItems`, `getItemById`, `update`,
`updateStatusForItems`, `delete`, `deleteItems`; orchestration `fetch()`, `patchState(patch)`,
`patchStateWithoutFetch(patch)`; and response helpers `Success<T>(data)`, `Failure<T>(errors)` (sync
variants only — no `Success$`/`Failure$`, since React's port is Promise-based, not Observable-based).

**Scope of `extends`**: ONLY `ProductService` and `ProductCategoryService` (and, if/when a
class-based `UsageService` is introduced) are required to extend this base in this change (see
`product-service` delta). The 4 offline storage services are explicitly NOT retrofitted onto this
base — that would reopen the separately-ratified "No Shared Offline Service Base" decision, which is
out of scope here.

#### Scenario: BaseService<T> exists with the full member set
- GIVEN `packages/domain/src/services`
- WHEN inspecting the exported `BaseService<T>`
- THEN it exposes `items$`, `isLoading$`, `isFirstLoading$`, `errorMessage$`, `create`,
  `getAllItems`, `getItemById`, `update`, `updateStatusForItems`, `delete`, `deleteItems`, `fetch()`,
  `patchState`, `patchStateWithoutFetch`, `Success`, `Failure`

#### Scenario: Offline storage services are not retrofitted
- GIVEN the 4 offline services (Expense/Order/SaleCredit/Inventory)
- WHEN their class declarations are inspected after this change lands
- THEN none extends the new domain-level `BaseService<T>` — the "No Shared Offline Service Base"
  requirement for these 4 remains in force, unmodified

### Requirement: BaseModel/AuditableBaseModel Shape Aligned To Angular
Angular's generic constraint on `BaseService<T>`'s id-bearing members (`getItemById`, `patchState`
row-selection bookkeeping) requires `T` to carry an `id: string`. React's `base.ts` `BaseModel`/
`AuditableBaseModel` types MUST be aligned to whatever minimal id-bearing shape the reproduced
`BaseService<T>` actually requires (design-phase decides the exact TypeScript encoding), WITHOUT
inventing extra fields beyond what Angular's own `base.model.ts` (`BaseError`, `BaseResponseModel`)
and the generic constraint demand. This is the only base.ts change permitted by this delta.

#### Scenario: BaseModel gains no unrelated fields
- GIVEN `base.ts`'s `BaseModel`/`AuditableBaseModel` before and after this change
- WHEN diffed
- THEN the only difference is whatever minimal shape `BaseService<T>`'s generic constraint requires
  — no unrelated fields are added
