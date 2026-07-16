# Design: Slice 7 — Reproduce Angular `BaseService<T>` in React

> Scope: ONLY Slice 7 (the architectural slice). Reverses the ratified
> `product-service-parity` decision that dropped `extends BaseService<Product>`
> (product-service.ts:20-24). User consciously confirmed the reversal (decision #2).

## MARK — needs user confirmation before tasks

**Reactive-state primitive.** Angular `BaseService<T>` holds a `BehaviorSubject`
block (`items$/isLoading$/isFirstLoading$/errorMessage$` + `fetch/patchState/
patchStateWithoutFetch`). Evidence from source: this block has **ZERO consumers**
— grep of `frontend-react/` for `items$|isLoading$|errorMessage$|patchState|.fetch()`
returns only an archived doc. React has **no RxJS** anywhere; state convention is
zustand (auth/cart/loading). The services we mirror never use it either: Angular
`ProductService` only declares abstract signatures; `UsageService` uses only
`this.http`; offline services use only inherited `Success$/Failure$`. Per playbook
this reactive block is the explicit "mark-and-ask" exception. **Recommended: Option C.**

| Option | Tradeoff | Verdict |
|--------|----------|---------|
| A. Add `rxjs`, reproduce `BehaviorSubject` 1:1 | Foreign dep purely for dead code; breaks zustand convention | Reject |
| B. Bridge to a zustand store per instance | Invents a translation (violates rule-12 "invent nothing"); per-instance vs module-singleton mismatch; no consumer to validate | Reject |
| **C. Reproduce the class SHAPE + method surface; state as plain fields** (`items/isLoading/isFirstLoading/errorMessage` getters over private fields; `fetch/patchState` mutate them) | Mirrors structure (rule 12) + Observable→Promise (rule 4, the only sanctioned transform); a multi-emission stream has no Promise equivalent and nothing subscribes | **Adopt (pending confirm)** |

## Architecture Decisions

**D1 — `BaseService<T>` = abstract class in `packages/domain/src/services/base-service.ts`.**
Mirrors Angular shape: HTTP CRUD (`create/getAllItems/getItemById/update/
updateStatusForItems/delete/deleteItems`) ported Observable→Promise over the
existing `apiClient` (no `HttpClient`); envelope helpers reuse `commons/envelope.ts`
`success/failure` (already ported) exposed as protected `Success/Failure` (+ async
`Success$/Failure$` returning `Promise.resolve(...)` to match the `$` names offline
impls call); reactive state per Option C. Constructor takes an optional api client;
offline subclasses pass none. Rationale: rule-12 mirrors Angular's "every service
extends BaseService" structure; catch-never-reject preserved.

**D2 — `ProductService`/`ProductCategoryService`: `interface` → `abstract class extends BaseService<T>`.**
The 12 (product) / 5 (category) async signatures are UNCHANGED — only the supertype
is re-added. Concrete impls switch `implements` → `extends` (TS `implements` on an
abstract class with concrete members would force the offline services to structurally
satisfy `create/items$/...`; `extends` inherits them instead, matching Angular
`ProductOfflineService extends ProductService`). Each concrete impl adds `super()`.
Rationale: honors decision #2 WITHOUT regressing product-service-parity's resolved
async shapes (A/B/C/D) — bodies untouched.

**D3 — `UsageService`: plain object → class `extends BaseService<Usage>`.**
`usage-http-service.ts` (`usageHttpService`, 2 apiClient methods) becomes a class
mirroring Angular `UsageService extends BaseService<Usage>` (override API_URL, 2 GET
methods). Consumers of `usageHttpService` re-grepped and adapted at apply.

**D4 — `base.ts` model reconciliation (rule 12).** Angular `AuditableBaseModel` does
NOT extend `BaseModel` (id commented out). React added `extends BaseModel`. Drop the
`extends` so React mirrors Angular. Keep standalone `BaseModel{id}` (Angular has it).
Sub-mark (minor): Angular `id: any` vs React `id: unknown` — recommend KEEP `unknown`
(typing improvement, no behavior change); revert to `any` only if TS compile fails.

## File Changes

| File | Action | Note |
|------|--------|------|
| `packages/domain/src/services/base-service.ts` | Create | abstract `BaseService<T>` (D1) |
| `packages/domain/src/services/product-service.ts` | Modify | interface→abstract class extends (D2) |
| `packages/domain/src/services/product-category-service.ts` | Modify | interface→abstract class extends (D2) |
| `packages/domain/src/models/base.ts` | Modify | `AuditableBaseModel` drop `extends BaseModel` (D4) |
| `apps/web-store-pos/app/admin/dashboard/lib/services/usage-http-service.ts` | Modify | object→class extends (D3) |
| `.../sales/lib/services/product-offline-service.ts` | Modify | `implements`→`extends`, `super()` |
| `.../sales/lib/services/product-online-service.ts` | Modify | `implements`→`extends`, `super()` |
| `.../sales/lib/services/product-category-offline-service.ts` | Modify | `implements`→`extends`, `super()` |
| `.../sales/lib/services/product-category-online-service.ts` | Modify | `implements`→`extends`, `super()` |
| `.../sales/lib/services/product-service.factory.ts` | Verify | return type still valid (abstract class is a type) |
| `services/__tests__/product-service.test.ts`, `product-category-service.test.ts` | Modify | Fakes `implements`→`extends` |
| usageHttpService consumers (admin dashboard) | Modify | adapt to class instance |

## Testing Strategy (strict TDD)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `BaseService<T>` CRUD via mocked apiClient; catch-never-reject; state getters defaults; `fetch` populates `items`; `Success/Failure` | RED→GREEN new base-service.test.ts |
| Unit | 12/5 async signatures unchanged | Existing service tests stay green (regression gate) |
| Unit | Concrete offline/online impls behavior | Existing suites stay green after re-parent + `super()` |
| Type | `AuditableBaseModel` drop-extends | tsc + tests touching `.id` on auditable models |

## Migration / Rollout

Single work-unit commit, ordered green at each step: (1) add BaseService + tests →
(2) re-parent domain contracts + fakes → (3) re-parent concrete impls + `super()` →
(4) UsageService class + adapt consumers → (5) base.ts model change. `git revert` as
a unit (base.ts coupled). Full suite green after the slice.

## Open Questions

- [ ] **Confirm Option C** for the reactive-state block (or choose A/B). Blocks tasks.
- [ ] `BaseModel.id`: keep `unknown` (recommended) or revert to Angular `any`?
