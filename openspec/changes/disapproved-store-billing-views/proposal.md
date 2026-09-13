# Proposal: Disapproved Store Billing Views

## Intent

Stores with `Approved == false` must show NO payment info anywhere. The billing engine is already correct (`BillingService.cs:56-60,72,101-102`), but `ResolvePlanType` and due-date computation lack the Approved guard, and React store cards price from paid module snapshots client-side.

## Scope

### In Scope
- `StoreProfile.ResolvePlanType` (:59-64, mappings :25,32,38): returns `"Gratis"` when `!store.Approved`.
- `GetStoresByCurrentUserQuery.cs:72-75` — `NextPaymentDate` null; `GetMyStoresQuery.cs:77-81` — `NextDueDate` null; `GetStorePlanQuery.cs:50-54` — `NextDueDate` null when `!Approved`.
- `store-card-list.tsx` + `owner-store-card.tsx`: no price when `approved === false`.
- NEW tests: backend E2E (new file, 3 endpoints, disapproved store with paid modules), backend unit (4 suites, approved:false), frontend unit (2 cards).

### Out of Scope
- Billing engine; `"Free"` /me summary contract (view contract is `"Gratis"`).
- Data invariant (clearing modules/PaymentStartDate on disapprove).
- Modifying any existing test.

## Capabilities

### New Capabilities
- `disapproved-store-payment-visibility`: `!Approved` stores expose no plan name, due dates, or prices on any store-view surface.

### Modified Capabilities
- `stores-by-current-user`: `StoreDto.PlanType "Gratis"` + `NextPaymentDate null` when `!Approved`.
- `management-stores`: `NextDueDate null` (my-stores + plan view); owner card price gate.
- `admin-stores`: super-admin card price gate.

## Approach

Backend guard at the single plan-name source + null-date guards in the 3 query handlers; frontend gates keyed on `planType !== 'Gratis'` (mirrors `store-plan.tsx`). Test-first per strict TDD config.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/Mappings/StoreManagement/StoreProfile.cs:25,32,38,59-64` | Modified | Approved guard in ResolvePlanType |
| `backend/src/Application/Features/Stores/Queries/GetStoresByCurrentUser/GetStoresByCurrentUserQuery.cs:72-75` | Modified | NextPaymentDate null when !Approved |
| `backend/src/Application/Features/Stores/Queries/GetMyStores/GetMyStoresQuery.cs:77-81` | Modified | NextDueDate null when !Approved |
| `backend/src/Application/Features/Stores/Queries/GetStorePlan/GetStorePlanQuery.cs:50-54` | Modified | NextDueDate null when !Approved |
| `frontend-react/apps/web-store-pos/app/admin/stores/components/store-card-list.tsx` | Modified | No price when approved===false |
| `frontend-react/apps/web-store-pos/app/management/stores/components/owner-store-card.tsx` | Modified | No price when approved===false |
| `backend/src/SMCA.WebApi.E2ETests/` + unit suites | New | Disapproved-store test coverage |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing test breaks | Low (verified none) | Stop, name it, ask — never modify without authorization |
| `"Gratis"` / `"Free"` contract mix | Low | Tests pin exact DTO strings |
| `/admin/stores` filter shift visible UX change | Med | Desired; flagged in review |
| Lifecycle stops producing disapproved+paid-snapshot stores | Med | E2E seeds pin the shape |

## Rollback Plan

Revert 5 backend guard points + 2 frontend gates; delete new test files. No data migration.

## Dependencies

- PostgreSQL `smca_test` for backend E2E; `StoreSeed` + `GetMeBillingZeroAmountTests.cs` patterns.

## Success Criteria

- [ ] New E2E: disapproved paid store → `"Gratis"` + null dates on all 3 endpoints
- [ ] New unit/frontend variants green; existing suites unchanged and green
