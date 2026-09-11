# Design: owner-plan-change

**Change**: owner-plan-change · **Phase**: Design · **Date**: 2026-09-10

## Technical Approach

Three coordinated mutations converge on a shared helper set. A new dedicated command (`ChangeStorePlanCommand`) gives the owner a guarded plan-change path; `ToggleStorePlanCommand` is rewritten to derive direction from `StorePlanId` and preserve the anchor; `UpdateStoreCommand` loses activation-on-first-paid and extends DG-7 to free stores. The "next payment date becomes today" rule lives in a new `Store.NextDueDateOverride` consumed by `StoreBillingUtils.GetNextDueDate` (priority: override > lastPaid > anchor+trial). Frontend activation switches from `updateStore(moduleIds)` to `changeStorePlan(storeId, planId)` — one hop, no client-side module unions, `planType` trustworthy because the backend writes `StorePlanId`.

```
ChangeStorePlanCommand (owner|SuperAdmin)
  ├─ guards: role, ownership (OwnerId → Owner.User.Id == callerGuid), store/owner active, plan valid+active
  ├─ load: IStoreRepository.GetStoreByIdIncludingModulesAsync (tracked) + IPlanRepository members
  ├─ mutate: StorePlanId, modules = priceIncluded catalog ∪ plan members, NextDueDateOverride (rule), PaymentStartDate UNTOUCHED
  └─ save: 1 SaveChangesAsync

ToggleStorePlanCommand (SuperAdmin|ReSeller, rewritten)
  ├─ direction: from StorePlanId (Gratis ⇔ free; != Gratis ⇔ paid)
  ├─ mutate: StorePlanId (↔ Gratis/Pago), modules (existing semantics), anchor KEPT, override per rule
  └─ ReSeller ownership check unchanged

UpdateStoreCommand (DG-7 extended, activation dropped)
  └─ non-SuperAdmin: ModuleIds set-change → PlanLocked (any store); SuperAdmin freeform unchanged

GetNextDueDate(paymentStartDate, trialMonths, lastPaidBeforeDate, nextDueDateOverride)
  └─ consumers pass Store.NextDueDateOverride: BillingService, GetStorePlanQuery, GetMyStoresQuery,
     GetStoresToCollectQuery, GetAllOwnersQuery, RegisterStorePaymentCommand
RegisterStorePaymentCommand: clears Store.NextDueDateOverride on payment
```

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| AD1 | Override cleared on downgrade | Yes — change to Gratis clears `NextDueDateOverride` | Keep stale override | A stale override would pin nextDue at a past date on a free store (no charge exists to advance it); semantics: override means "this plan's charge is due today". Cleared by payment too. |
| AD2 | Ownership guard mechanism | `store.OwnerId → Owner.User.Id == callerGuid` via `UserExternalId.ToGuid()` | SelectedStore comparison | `UserExternalId` is the established pattern (ToggleStorePlan, GetMe). Loading `GetStoreWithModulesAndReSellerOwnerAsync` brings Owner.User for the active check too. |
| AD3 | Module derivation for change-plan | priceIncluded catalog modules ∪ target plan members (server-side) | Exact plan members only | Matches today's FE union (`planModuleIdsForActivation`) and seeded membership where Gratis includes priceIncluded-flagged paid modules (Reports); avoids dropping always-included modules on downgrade. |
| AD4 | Toggle direction | From `StorePlanId` | From PaymentStartDate | Every store's clock starts at creation; PaymentStartDate no longer discriminates plan state. StorePlanId is the plan source of truth (also fixes desync). |
| AD5 | GetNextDueDate signature | New optional 4th param `DateOnly? nextDueDateOverride` (priority first) | Separate wrapper method | Optional param keeps all call sites compiling; one util stays the single source (RegisterStorePayment advances from it). |
| AD6 | Override on upgrade when overdue | Set to today (not today+5) | today+graceDays | User decision: grace already exists downstream (EnGracia window, PaymentGraceDays=5) — nextDue=today + dueSoonDays=5 → PorVencer, modules active, 5 days to pay. |
| AD7 | FE readOnly/DG-7 lock | Removed entirely from panels/modal/page | Keep for non-owner viewers | The dialog opens from the owner's own card / the admin plan page; SuperAdmin sees panels too (no lock). Ownership is enforced backend; FE lock was redundant UX. |
| AD8 | "plan_anterior" source | `StorePlan.Order` via ordered plans array | Hardcoded sequence | Order is seeded (1/2/3/4); ordered GET /v1/plans gives the chain; previous = max order < current plan order (fallback: first plan if none — Gratis shows plain "Incluye:"). |
| AD9 | Tests ownership check | New ChangeStorePlanTests.cs E2E + handler IT | Extend StoreUpdateTests | Clean matrix; existing suites keep their focus (only authorized facts change). |
| AD10 | UpdateStore PaymentStartDate param | Stays SuperAdmin-only, unchanged | Remove | SuperAdmin explicit anchor set (PUT payment-date exists but this param is contract; E2E PaymentDateTests pin it). Do not break that contract. |

## Data Flow

```
POST /v1/stores/{id}/change-plan {storePlanId}
  → validator: storePlanId defined enum value + active plan
  → handler guards (role → ownership → store active → owner user active → plan valid)
  → store = GetStoreWithModulesAndReSellerOwnerAsync (Owner.User needed)   [NoTracking caveat: use tracked variant]
  → members = plan modules; freeIds = catalog priceIncluded
  → targetModuleIds = freeIds ∪ memberIds
  → StorePlanId = storePlanId
  → NextDueDateOverride rule:
      target plan paid && GetNextDueDate(anchor, trial, lastPaid, override) <= today
        → override = today
      target Gratis → override = null
      future due    → leave override untouched
  → UpdateStoreModules-equivalent mutation (soft-delete absent / insert / reactivate + StoreRoleFeatures)
  → SaveChangesAsync → 200 true

Registration flow (existing, +1 line):
  RegisterStorePayment → store.NextDueDateOverride = null (PaymentBeforeDate wins next)

Status computation (unchanged shape):
  GetNextDueDate(anchor, trial, lastPaid, store.NextDueDateOverride) → nextDue
  → PorVencer (due=today ≤ dueSoonDays) → IsPaidPlanActive=true → FilterForBilling keeps paid modules
```

## File Changes

### Backend — New
| File | Purpose |
|------|---------|
| `Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/ChangeStorePlanCommand.cs` | Record + handler (guards, membership, anchor, override rule) |
| `Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/ChangeStorePlanCommandValidator.cs` | storePlanId: defined + active |
| `Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/ChangeStorePlanCommandHandlerTests.cs` | IT matrix (Application.Tests) |
| `SMCA.WebApi.E2ETests/Stores/ChangeStorePlanTests.cs` | E2E matrix + anchor immutability |
| `Infrastructure/Migrations/<ts>_Add-Store-NextDueDateOverride.cs` | Additive nullable column |
| `Infrastructure/Persistence/EntityConfigurations/StoreEntityTypeConfiguration.cs` | Column config |

### Backend — Modified
| File | Change |
|------|--------|
| `Domain/Entities/Stores/Store.cs` | `NextDueDateOverride` property |
| `Domain/Common/Utils/StoreBillingUtils.cs` | `GetNextDueDate` optional 4th param (priority first) |
| `Application/Features/.../ToggleStorePlan/ToggleStorePlanCommand.cs` | Direction from StorePlanId; anchor kept; StorePlanId written; override rule |
| `Application/Features/.../UpdateStore/UpdateStoreCommand.cs` | Drop activation-on-first-paid; DG-7 any-store same-set-only for non-SuperAdmin |
| `Application/Features/.../RegisterStorePayment/RegisterStorePaymentCommand.cs` | Clear override + pass it to GetNextDueDate |
| `Application/Services/Billing/BillingService.cs` | Pass override to GetNextDueDate |
| `Application/Features/.../GetStorePlan/GetStorePlanQuery.cs` | Pass override |
| `Application/Features/.../GetMyStores/GetMyStoresQuery.cs` | Pass override |
| `Application/Features/.../GetStoresToCollect/GetStoresToCollectQuery.cs` | Pass override |
| `Application/Features/Administration/Owners/Queries/GetAllOwners/GetAllOwnersQuery.cs` | Pass override |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | POST change-plan endpoint (`[HasPermission(SuperAdmin, StoresAdmin)]` action-level) |
| `Domain/Interfaces/Repositories/IPlanRepository.cs` | `GetActivePlanWithModulesByIdAsync(int)` (or reuse catalog + filter) |

### Frontend — New
| File | Purpose |
|------|---------|
| `app/management/stores/components/__tests__/` updates | Dialog contract tests |

### Frontend — Modified
| File | Change |
|------|--------|
| `plan-panels.tsx` | Rows stripped (name+"?"); header strike+current right-aligned; "Activar Plan"; INCLUDES_PREVIOUS_PLAN; "?" h-6 w-6 green; readOnly prop removed |
| `edit-plan-modal.tsx` | Close right-aligned (`flex justify-end`); readOnly removed |
| `store-plan.tsx` | handleActivate → changeStorePlan; readOnly removed |
| `my-stores.tsx` | handlePlanActivate → changeStorePlan; readOnly removed |
| `store-http-service.ts` + domain types | `changeStorePlan(storeId, planId)`; Plan type unchanged |
| `plan-utils.ts` | `planModuleIdsForActivation` deleted |
| `es.ts` | ACTIVATE_PLAN → "Activar Plan"; INCLUDES_PREVIOUS_PLAN `{plan}` placeholder; INCLUDES kept for Gratis |

### Tests — Modified (authorized E2E)
| File | Change |
|------|--------|
| `SMCA.WebApi.E2ETests/Stores/StorePlanLockTests.cs` | 4 facts: same-set OK (owner paid) stays; PlanLocked now also free-store set-change; SuperAdmin unchanged; rename-only OK |
| `SMCA.WebApi.E2ETests/Stores/StorePlanChangeTests.cs` | Toggle facts: anchor kept + StorePlanId assertions; owner PUT facts aligned |
| `SMCA.WebApi.E2ETests/Stores/ToggleStorePlanTests.cs` | Anchor kept (never null); StorePlanId written; override rule |
| `frontend-react/e2e/store-plan-lock-regression.spec.ts` | S2-02 repurposed: catch regression = owner plan change MUST exist via dialog/change-plan (not PUT); paymentStartDate never null |
| `frontend-react/e2e/owner-stores.spec.ts` | E-09: lock → owner CAN change plan on paid store (button present); E-08: activation via change-plan POST |
| `frontend-react/e2e/store-plan-activation.spec.ts` | S2-01: activation walk switches to change-plan endpoint + no PUT |
| Unit (backend `UpdateStoreCommandHandlerLockTests.cs`; FE `plan-panels/store-plan/my-stores.test.tsx`) | Behavior-aligned updates |

## Interfaces / Contracts

```csharp
// ChangeStorePlanCommand
public sealed record ChangeStorePlanCommand(Guid StoreId, int StorePlanId) : ICommand<bool>;
// POST /v1/stores/{id}/change-plan  body: { "storePlanId": 2 }
// → ResponseResult<bool>; 403 non-owner, 400 inactive/unknown plan/no-op? (no-op = 200 true, idempotent)

// StoreBillingUtils
public static DateOnly? GetNextDueDate(DateOnly? paymentStartDate, int trialMonths,
    DateOnly? lastPaidBeforeDate, DateOnly? nextDueDateOverride = null);
// override non-null → return override; else existing chain.

// Store
public DateOnly? NextDueDateOverride { get; set; }   // EF: nullable, no default
```

FE contract: `changeStorePlan(storeId: string, planId: number): Promise<ResponseResult<boolean>>`.

## Testing Strategy

Strict TDD per work unit. Baselines counted before/after (pre-existing failures must not grow: backend E2E suite, FE suite, typecheck).

| Layer | What | Approach |
|-------|------|----------|
| Unit (Domain) | `GetNextDueDate` override priority + null cases | Direct static calls |
| Unit/IT (handler) | ChangeStorePlan matrix: owner ok / not-owner 403 / unknown plan 400 / inactive store+owner 400 / membership modules / anchor preserved / override=today (overdue paid) / none (future) / clears on Gratis / VIP target / SuperAdmin / no-op same plan | Moq repos like UpdateStoreCommandHandlerLockTests |
| IT (billing) | RegisterStorePayment clears override | Existing pattern |
| E2E backend | Same matrix via HTTP + anchor immutability (change-plan, toggle, update) + PlanLocked free-store PUT + toggle keeps anchor/never-null | Real Postgres, BillingSeed/MutableDateTimeProvider.Pin |
| FE unit | Panels: rows stripped, strike header, includes-previous, "Activar Plan", close right; modal/page flows call changeStorePlan | Existing vitest patterns |
| FE E2E | S2-01/S2-02/E-08/E-09 authorized updates + new owner plan-change spec | Analysis-based (Playwright not local) |

## Migration / Rollout

One additive migration (nullable `NextDueDateOverride` on Store). No seed. Deploy: migration first, then binaries. Rollback: revert commits; column harmless if left. No data loss (anchor never touched).

## Open Questions

None — product decisions locked (decisions record 2026-09-10); mechanical details resolved by explore.
