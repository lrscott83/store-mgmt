# Proposal: Store Paid-Plan Billing Backend

## Intent

Turn disconnected billing scaffolding into a working per-store paid-plan lifecycle. `StorePayment` rows exist but nothing creates or reads them; `Store.PaymentStartDate` is non-nullable and set at creation; enforcement is absent from the entitlement path. This proposal closes those gaps: activation on first paid-plan choice, compute-on-read overdue downgrade, manual payment recording (super admin + ReSeller), collections and commission queries. No background jobs, no payment gateway.

## Scope

### In Scope
1. `PaymentGraceDays` system config (enum `3`, repo accessor, seed `"5"`)
2. `StoreBillingUtils` — pure math: commission, next due date, status (`NoAplica`→`Vencido`), `IsPaidPlanActive`, `IsInTrial`
3. `Store.PaymentStartDate` → `DateOnly?`, activate-on-first-paid, owner lock after activation
4. `StorePayment` reseller fields: `ReSellerId`, `ReSellerPercentDiscountPrice`, `ReSellerDiscountPrice`, `ReSellerAmount`, `ByReSeller`
5. `IStoreBillingService` — orchestrates repos + config + utils
6. **Enforcement**: overdue → free modules in `GetMeQueryHandler` + `HasPermissionAttribute`; expose `PaymentDueDate`, `IsInTrial`, `PaymentStatus` on `CurrentUserDto`
7. `RegisterStorePaymentCommand` — `POST /stores/{id}/payments`, super admin + reseller-scoped, computes commission, advances due date
8. `GetStoresToCollectQuery` — `GET /stores/to-collect`, filters `PorVencer`/`EnGracia`, scoped per role
9. `GetReSellerCommissionsQuery` — `GET /stores/reseller-commissions`, grouped by year/month

### Out of Scope
- Payment gateway / online payments — manual recording only
- Background jobs / scheduled enforcement — compute-on-read only
- Email/push notifications — in-app banner only (frontend plan)
- Debt accumulation — single next-due-date model
- Frontend work (plan-picker, banner, collections UI) — separate companion plan

## Architecture Approach

Three-layer:

| Layer | Component | Role |
|-------|-----------|------|
| Domain | `StoreBillingUtils` + `CurrentPriceServiceUtils` | Pure math, no deps, fully unit-testable |
| Application | `IStoreBillingService` | Orchestrates repos + config, delegates math to utils |
| Enforcement | `FilterForBilling()` in `GetMeQueryHandler` + `HasPermissionAttribute` | Compute-on-read — reversible, no destructive writes |

Payments flow: `Controller → RegisterStorePaymentCommand → StorePayment.Create` with commission computed from `ReSellerOwner` snapshot. Authorization: action-level `[HasPermission(SuperAdmin, ReSellerAdmin)]` on new endpoints (class-level `[HasPermission(SuperAdmin, StoresAdmin)]` stays for existing).

Task dependencies (ref: [exploration](./exploration.md)):
```
Task 1 ──┐          Task 2 ──┐
          ├── Task 5 ──┬── Task 6
Task 3 ──┘            ├── Task 7 ──┬── Task 8
Task 4 ──┘            └────────────┴── Task 9
```

Full rationale in [design spec](../../../docs/superpowers/specs/2026-07-25-store-paid-plan-billing-enforcement-design.md) and [implementation plan](../../../docs/superpowers/plans/2026-07-25-store-paid-plan-billing-backend.md).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| NRT migration: `DateOnly`→`DateOnly?` conflicts with EF `.IsRequired()` | Low | Check entity config before migration |
| `HasPermissionAttribute` sync `.Result` pattern breaks | Low | Match existing codebase style, E2E test |
| `ReSellerOwner` null chain (`Store.Owner.ReSellerOwner`) | Med | Null-guard all navigation access |
| Existing test assertions break on `PaymentStartDate` change | Med | Run full test suite after each task, update assertions |

## Rollback

Revert commits per task. All migrations are additive — no data loss. Enforcement is compute-on-read: no irreversible writes. `PaymentStartDate` nullability is safe (existing rows keep value, treated as activated).

## Dependencies

- Existing scaffolding: `StorePayment` entity, `Store.PaymentStartDate`, `CurrentPriceServiceUtils`, `ReSeller`/`ReSellerOwner`
- No external service dependencies

## Success Criteria

- [ ] All 9 tasks implemented with unit tests + E2E passing
- [ ] Overdue store → `GetMe` returns only free module IDs, `PaymentStatus = "Vencido"`
- [ ] Super admin + ReSeller can record payments; commission computed correctly per `ReSellerOwner` snapshot
- [ ] Collections query returns only `PorVencer`/`EnGracia` stores, scoped by caller role
- [ ] Build clean: `dotnet build` green; all migrations additive
- [ ] Existing `CreateStoreServiceTests` and `UpdateStoreTests` pass after nullable change
