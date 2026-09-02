# Proposal: Store Plan Toggle (Free ↔ Paid)

## Intent

Add a "Change Plan" gear action on `/admin/stores` that atomically toggles a store between Free and Paid, for SuperAdmin and Reseller roles.

## Why

Plan changes require the full edit form (module set + payment date) — a loose multi-step path for a binary state with rigid module semantics. A dedicated toggle gives a fast, confirmed, atomic Free↔Paid control.

## Scope

### In Scope
- **Backend**: `POST /v1/stores/{id}/toggle-plan` + `ToggleStorePlanCommand` (CQRS, `[HasPermission(SuperAdmin, StorePaymentAdmin)]`, atomic via one `SaveChangesAsync`)
- **Free→Paid**: `PaymentStartDate = today` (`IDateTimeProvider`); add ALL paid modules (`PriceIncluded=false`) to `StoreModules` (insert or re-activate); generate `StoreRoleFeature`s (UpdateStoreCommand pattern)
- **Paid→Free**: `PaymentStartDate = null`; soft-delete paid `StoreModules` (`IsActive=false`); deactivate their `StoreRoleFeature`s; free modules untouched
- **Preconditions**: store `IsActive` AND owner's `User.IsActive`, else 400
- **List widening**: `GET /v1/stores/by-current-user` admits Resellers, scoped to `ReSellerOwner` stores (mirrors to-collect) — else their list is empty
- **Frontend**: `store-list.tsx` loader `superAdminLoader` → `resellerLoader` (exists, admits both; spec keeps `superAdminLoader` frozen); `StoreCardList` item + direction-aware `confirmDialog`; `storeHttpService.toggleStorePlan`; i18n in `es.ts`

### Out of Scope
- Trial/due-date math, payment recording, collections UI
- Angular legacy app (no parity source — net-new, per config rule)
- OwnerAdmin toggle rights (denied by gate)

## Capabilities

### New Capabilities
- `store-plan-toggle`: endpoint contract, command rules, UI action, i18n

### Modified Capabilities
- `stores-by-current-user`: R1 role table gains Reseller row + gate widening
- `admin-stores`: gear menu gains Change Plan; loader swap; confirm-dialog extension
- `billing`: toggle as explicit activation/deactivation path (R8/R12 interplay)

## Approach

Handler loads store with modules (`GetStoreByIdIncludingModulesAsync`), checks preconditions, branches on `PaymentStartDate`, mutates via repository Add/Update (NoTracking-safe), one `SaveChangesAsync`. Frontend: gear item → `confirmDialog` (copy from current plan) → POST → reload list.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Empty reseller list if endpoint not widened | Medium | In-scope ReSellerOwner widening |
| Toggle vs plan-edit race | Low | Single transaction; design decision |
| DG-7 interplay (OwnerAdmin denied) | Medium | Action-level gate; delta spec |

## Rollback Plan

Git revert. Paid→Free soft-deletes reversible (`IsActive` re-activation); Free→Paid null loses no data — re-toggle restores.

## Dependencies

None external. Uses `IDateTimeProvider`, module/repository services from UpdateStoreCommand set.

## Success Criteria

- [ ] E2E: both toggle directions mutate date/modules/StoreRoleFeatures correctly
- [ ] E2E: inactive store or owner → 400; Reseller OK, OwnerAdmin denied
- [ ] Playwright: gear menu + confirm dialog for both directions

## Open Questions

1. Reseller list scope — `ReSellerOwner`-only or all stores? → **RESOLVED**: `ReSellerOwner`-only (spec R6/R7 store list widening; implemented `GetActiveStoresByReSellerUserIdAsync`).
2. Free→Paid adds ALL paid modules — subset UX needed? → **RESOLVED**: no subset UX; spec R3 mandates all paid modules (design §decisions).
3. Toggle response: `bool` + reload or updated `StoreDto`? → **RESOLVED**: `ResponseResult<bool>` + list reload (spec R5; design §decisions).