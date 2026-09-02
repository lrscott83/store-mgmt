# Tasks: Store Plan Toggle (Free <-> Paid)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend command+controller) → PR 2 (query widening+repo) → PR 3 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend toggle command + controller action | PR 1 | `dotnet test backend/src/Application.Tests` | Real POST `/v1/stores/{id}/toggle-plan` | Revert ToggleStorePlanCommand + controller action |
| 2 | Query widening + new repo method (ReSeller list) | PR 2 | `dotnet test backend/src/Application.Tests` | GET `/v1/stores/by-current-user` as ReSeller | Revert GetStoresByCurrentUser branch + repo method |
| 3 | Frontend loader/gear/dialog/service/i18n | PR 3 | `npm test` in web-store-pos | Playwright `/admin/stores` toggle flow | Revert store-list/service/card-list/i18n changes |

## Phase 1: Backend Toggle Command (PR 1)

- [x] 1.1 Create `backend/src/Application/Features/StoreManagement/Stores/Commands/ToggleStorePlan/ToggleStorePlanCommand.cs` — `ToggleStorePlanCommand(Guid StoreId) : ICommand<bool>` (no body)
- [x] 1.2 In handler: load store via `GetStoreWithModulesAndReSellerOwnerAsync`; validate store exists, `IsActive`, `Owner.User.IsActive`; if ReSeller verify `IsStoreOwnedByReSellerUserAsync`
- [x] 1.3 Compute target from `PaymentStartDate`; if already on target return no-op `data=true`
- [x] 1.4 Implement `ApplyFreeToPaid`: set `PaymentStartDate = DateOnly.FromDateTime(dateTimeProvider.UtcNow.UtcDateTime)`, add/reactivate ALL `PriceIncluded=false` StoreModules, generate StoreRoleFeatures (reuse `UpdateStoreModules` shape)
- [x] 1.5 Implement `ApplyPaidToFree`: set `PaymentStartDate = null`, soft-delete paid StoreModules (`IsActive=false`), deactivate StoreRoleFeatures
- [x] 1.6 Single `SaveChangesAsync(cancellationToken)`; return `ResponseResult<bool>`
- [x] 1.7 Add `[HttpPost("{id}/toggle-plan")]` action to `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` with `[HasPermission(SuperAdmin, StorePaymentAdmin)]` returning `ResponseResult<bool>`

## Phase 2: Query Widening + Repo (PR 2)

- [x] 2.1 Add `GetActiveStoresByReSellerUserIdAsync(Guid reSellerUserId, Guid? excludeStoreId)` to `backend/src/Domain/Interfaces/Repositories/IStoreRepository.cs`
- [x] 2.2 Implement it in `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs` — stores where owner linked via `ReSellerOwner` to caller, active only, exclude DefaultStore
- [x] 2.3 Add ReSeller branch to `backend/src/Application/Features/StoreManagement/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs` — when `IsReSeller`, call new repo method; keep SuperAdmin/non-super branches intact

## Phase 3: Frontend (PR 3)

- [x] 3.1 Add `toggleStorePlan(storeId): Promise<BaseResponseModel<boolean>>` to `frontend-react/apps/web-store-pos/app/management/stores/lib/services/store-http-service.ts` (POST `/v1/stores/{id}/toggle-plan`)
- [x] 3.2 Swap loader in `frontend-react/apps/web-store-pos/app/admin/stores/routes/store-list.tsx` from `superAdminLoader` → `resellerLoader` (superAdminLoader untouched/frozen); add `handleToggle` with direction-aware `confirmDialog` + `loadStores()` reload (menu item hidden when inactive)
- [x] 3.3 Add `onToggle` prop (optional — owner-edit's store tab omits it and never renders the item) + "Cambiar plan" `ActionMenuItem` (hidden when inactive, `intent="pay"`) to `frontend-react/apps/web-store-pos/app/admin/stores/components/store-card-list.tsx`
- [x] 3.4 Add i18n keys to `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`: `STORES.CHANGE_PLAN`, `STORES.ACTIVATE_PAID_TITLE`, `STORES.ACTIVATE_PAID_MESSAGE`, `STORES.DEACTIVATE_PAID_TITLE`, `STORES.DEACTIVATE_PAID_MESSAGE` (exact copy from spec)

## Phase 4: Tests

- [x] 4.1 Unit tests for `ToggleStorePlanCommandHandler`: Free→Paid sets date/adds/activates modules + generates features; Paid→Free nulls date/soft-deletes modules/features, free untouched; preconditions (inactive store, inactive owner → 400); reseller non-owner → StoreNotFound; idempotent no-op
- [x] 4.2 Unit tests for `GetStoresByCurrentUserQueryHandler` ReSeller branch (mock `IsReSeller` + repo)
- [ ] 4.3 E2E xUnit under `backend/src/SMCA.WebApi.E2ETests` (real PostgreSQL): both toggle directions mutate date/modules/StoreRoleFeatures; Reseller OK, OwnerAdmin denied; inactive store → 400 — VERIFY PHASE (E2Es out of apply scope; adding is allowed but owned by verify)
- [x] 4.4 Frontend component tests (unit): gear item present when active / absent when inactive, direction-aware dialog copy both ways, cancel-no-call, list refresh. Playwright flow — VERIFY PHASE (E2Es out of apply scope)

## Phase 5: Cleanup / Docs

- [ ] 5.1 Verify billing R8/R12: after Paid→Free GET DTO shows null / status `NoAplica`; after Free→Paid DTO shows today's date — VERIFY PHASE (requires E2E harness)
- [x] 5.2 Update design/proposal open questions (subset UX) if resolved at review — resolved: toggle response is `bool` + list reload (spec R5 fixed `ResponseResult<bool>`; design §decisions); flip-always semantics (no request body) with module-side idempotent no-op for R4d "already Free"
