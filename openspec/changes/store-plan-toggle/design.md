# Design: Store Plan Toggle (Free <-> Paid)

## Technical Approach

Add an atomic `POST /v1/stores/{id}/toggle-plan` endpoint backed by a `ToggleStorePlanCommand`. The handler loads the store with modules + owner + owner.user, validates preconditions, computes the target plan from `PaymentStartDate`, and applies Free→Paid or Paid→Free module/date mutations in one `SaveChangesAsync`. The frontend exposes a "Cambiar plan" gear item with a direction-aware confirm dialog that POSTs then reloads the list. The store list widens to Resellers via a new `ReSellerOwner` branch in `GetStoresByCurrentUserQueryHandler`. References spec R1-R5, billing delta R8/R12.

## Architecture Overview

```
store-card-list (Cambiar plan) ─→ store-list.tsx (confirmDialog → POST)
      │
      ▼
storeHttpService.toggleStorePlan ─→ POST /v1/stores/{id}/toggle-plan
      │
      ▼
StoresController.ToggleStorePlanAsync [HasPermission(SuperAdmin, StorePaymentAdmin)]
      │
      ▼
ToggleStorePlanCommandHandler ─→ one SaveChangesAsync
      │  ├─ Free→Paid: PaymentStartDate=today, add/activate paid StoreModules, gen StoreRoleFeatures
      │  └─ Paid→Free: PaymentStartDate=null, deactivate paid StoreModules + StoreRoleFeatures
      ▼
List reload (loadStores) → StoreDto reflects new PaymentStartDate (R12)
```

## Architecture Decisions

| Decision | Alternatives | Choice / Rationale |
|---|---|---|
| Reuse `RegisterStorePaymentCommand` authorization pattern | New bespoke auth | Follow existing ReSeller scoping: `GetStoreWithModulesAndReSellerOwnerAsync` + `IsStoreOwnedByReSellerUserAsync`. Proven pattern; carrier of the reseller link. |
| Controller-level `[HasPermission(SuperAdmin, StorePaymentAdmin)]` gate | Handler role guard only | Belt + suspenders; action-level gate blocks OwnerAdmin (DG-7), handler still re-verifies reseller ownership. Mirrors `RegisterStorePaymentAsync`. |
| Response `ResponseResult<bool>` | Return updated DTO | Spec R5 fixes `ResponseResult<bool>`; frontend re-fetches list via `loadStores()`, so no DTO round-trip needed. |
| Module mutation via dedicated private method | Inline in handler | Reuse `UpdateStoreCommand.UpdateStoreModules` shape (soft-delete, reactivate, store-role-feature gen); extract an internal `ApplyPaidToFree` / `ApplyFreeToPaid` for clarity. |
| Idempotent no-op 200 when already on target | 409/400 | Spec R4d/4a: already-on-target → no-op, `data=true`. |

## Data Flow

    Handler:
      GetStoreWithModulesAndReSellerOwnerAsync(id)
        → store (modules, owner, owner.ReSellerOwner)
      validate: store != null, store.IsActive, owner.User.IsActive
      if ReSeller: IsStoreOwnedByReSellerUserAsync(storeId, reSellerUserId)
      target = store.PaymentStartDate != null ? "Free" : "Paid"
      if current == target → return true (no-op)
      apply mutation (date + modules) ──→ SaveChangesAsync >0

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/Features/StoreManagement/Stores/Commands/ToggleStorePlan/ToggleStorePlanCommand.cs` | Create | Command + handler + response DTO |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modify | Add `[HttpPost("{id}/toggle-plan")]` action, `[HasPermission(SuperAdmin, StorePaymentAdmin)]` |
| `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs` | Modify | Add ReSeller branch scoping to `ReSellerOwner` owners; add `GetActiveStoresByReSellerUserIdAsync` (new repo method) |
| `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs` + `StoreRepository.cs` | Modify | Add `GetActiveStoresByReSellerUserIdAsync(Guid reSellerUserId, Guid? excludeStoreId)` |
| `frontend-react/.../admin/stores/routes/store-list.tsx` | Modify | Loader swap `superAdminLoader`→`resellerLoader`; add toggle handler + state |
| `frontend-react/.../admin/stores/components/store-card-list.tsx` | Modify | Add `intent="edit"`-style "Cambiar plan" ActionMenuItem (hidden when inactive), new `onToggle` prop |
| `frontend-react/.../management/stores/lib/services/store-http-service.ts` | Modify | Add `toggleStorePlan(storeId): Promise<BaseResponseModel<boolean>>` |
| `frontend-react/.../shared/lib/i18n/es.ts` | Modify | Add plan-toggle keys (below) |

## Interfaces / Contracts

```csharp
public sealed record ToggleStorePlanCommand(Guid StoreId) : ICommand<bool>; // no body

// Controller: POST /v1/stores/{id}/toggle-plan  → ResponseResult<bool>
```

```typescript
// store-http-service
async toggleStorePlan(storeId: string): Promise<BaseResponseModel<boolean>> {
  const res = await apiClient.post<BaseResponseModel<boolean>>(`/v1/stores/${storeId}/toggle-plan`);
  return res.data;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Free→Paid sets date, adds/activates paid modules, generates StoreRoleFeatures | Handler tests mocking repos (mirror `UpdateStoreCommandHandlerLockTests`); assert `SaveChangesAsync` called once |
| Unit | Paid→Free nulls date, soft-deletes paid modules + features; free untouched | Handler tests |
| Unit | Preconditions: inactive store, inactive owner.user → 400; reseller non-owner → StoreNotFound; no-op idempotency | Handler tests |
| Unit | `GetStoresByCurrentUserQueryHandler` ReSeller branch | Mock `IsReSeller` + repo returning reseller-scoped stores |
| E2E | Both toggle directions mutate date/modules/StoreRoleFeatures; Reseller OK, OwnerAdmin denied, inactive → 400 | New xUnit E2E under `SMCA.WebApi.E2ETests` (real PostgreSQL), seeding via existing helpers |
| Frontend | Confirm-dialog copy + cancel-no-call + list refresh | Component/Playwright test for `store-card-list` + `store-list` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (HTTP endpoint + DB mutation only.)

## Migration / Rollout

No data migration. Paid→Free soft-deletes (`IsActive=false`) — reversible by re-toggling. Free→Paid inserts new StoreModule rows and re-activates any soft-deleted; no data loss. `PaymentStartDate=null` is the first nullification path (billing R8) — billing `GetStatus` degrades to `NoAplica`, which `StoreBillingUtils` already handles.

## Open Questions

- [ ] Free→Paid adds ALL paid modules — spec R3 mandates "ALL"; confirm no subset UX requirement surfaces at review.

## Risks

| Risk | Mitigation |
|---|---|
| Toggle vs plan-edit race | Single `SaveChangesAsync` transaction + design decision |
| OwnerAdmin denied (DG-7) | Controller gate `[HasPermission(SuperAdmin, StorePaymentAdmin)]` (OwnerAdmin lacks `StorePaymentAdmin`) |
| Empty Reseller list if query not widened | ReSeller branch in `GetStoresByCurrentUserQueryHandler` in scope |
| Paid→Free billing clock reversal (first nullification) | `StoreBillingUtils.GetStatus`/`FilterForBilling` already handle `paymentStartDate=null` → `NoAplica`; E2E asserts status recomputes |
