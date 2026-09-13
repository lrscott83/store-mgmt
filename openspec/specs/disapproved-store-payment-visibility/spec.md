# disapproved-store-payment-visibility Specification

**Change**: disapproved-store-billing-views · **Domain**: disapproved-store-payment-visibility · **Type**: New capability (full spec) · **Date**: 2026-09-13

## Purpose

A store with `Approved == false` MUST expose no payment information on ANY store-view surface: plan name, due dates, or card prices. The billing engine (`BillingService`) already applies the rule to the `/me` summary (`"Free"` contract); this spec extends it to the store-listing/plan DTOs and the React store cards, whose current behavior derives plan names and prices from `StorePlanId` and paid module snapshots without the Approved guard.

## Requirements

### Requirement: REQ-1 — Disapproved Store Plan Name Is "Gratis" on Every Store DTO

For any store with `Approved == false`, the `PlanType` contract field on `StoreDto`, `StorePlanDto`, and `OwnerStoreDto` MUST equal `"Gratis"`, regardless of `StorePlanId`, paid module snapshot, or `PaymentStartDate`. `"Gratis"` is the view contract, distinct from the billing summary's `"Free"`.

#### Scenario: Disapproved store with paid snapshot and payment clock

- GIVEN a store with `Approved=false`, `StorePlanId=Pago`, `PaymentStartDate=2026-01-10`, and active paid snapshot modules
- WHEN `StoreProfile` maps the store to a store-view DTO (by-current-user, my-stores, plan)
- THEN `PlanType` equals `"Gratis"` on every DTO

#### Scenario: Approved store plan name unchanged

- GIVEN an approved store with `StorePlanId=Pago`
- WHEN the same mapping runs
- THEN `PlanType` equals `"Pago"` (derived from `StorePlanId` as before)

#### Scenario: Null-clock store unchanged

- GIVEN a store with `PaymentStartDate=null` and no paid modules
- WHEN the same mapping runs
- THEN `PlanType` equals `"Gratis"` (existing behavior preserved)

### Requirement: REQ-2 — Disapproved Store Due Dates Are Null on Every Store DTO

For any store with `Approved == false`, the due-date fields (`StoreDto.NextPaymentDate`, `OwnerStoreDto.NextDueDate`, `StorePlanDto.NextDueDate`) MUST be `null`, regardless of `PaymentStartDate` or payment history. No due date SHALL be computed via `GetNextDueDate` for a disapproved store.

#### Scenario: Disapproved store hides computed due date

- GIVEN a disapproved store with `PaymentStartDate=2026-01-10` and paid snapshot modules
- WHEN `GET /v1/stores/by-current-user`, `GET /v1/stores/my-stores`, or `GET /v1/stores/{id}/plan` returns the store
- THEN `NextPaymentDate`/`NextDueDate` is `null` on the respective DTO

#### Scenario: Approved store keeps computed due date

- GIVEN an approved store with `PaymentStartDate=2026-01-10`
- WHEN the same endpoints return the store
- THEN the due date equals the existing `GetNextDueDate` result (unchanged)

#### Scenario: Null-clock store stays null

- GIVEN any store with `PaymentStartDate=null`
- WHEN the same endpoints return the store
- THEN the due-date field remains `null` (existing behavior preserved)

### Requirement: REQ-3 — Store Cards Render No Price for Disapproved Stores

Both store cards — super-admin `admin/stores/components/store-card-list.tsx` and owner `management/stores/components/owner-store-card.tsx` — MUST NOT render a price when the store's `planType` is `"Gratis"`, even when the module snapshot contains paid modules with a price. The price gate SHALL use the same key as `store-plan.tsx` (`planType !== 'Gratis'`); no price line SHALL rely on the module snapshot alone.

#### Scenario: Super-admin card hides leak price

- GIVEN a disapproved store with paid snapshot modules (`currentPrice` present) and `planType="Gratis"`
- WHEN its card renders on `/admin/stores`
- THEN no price line renders

#### Scenario: Owner card hides leak price and date

- GIVEN a disapproved store with paid snapshot modules and `planType="Gratis"`
- WHEN its card renders on `/management/my-stores`
- THEN no price line and no due-date line render

#### Scenario: Approved paid store keeps price

- GIVEN an approved store with `planType="Pago"` and paid modules
- WHEN its card renders on either surface
- THEN the price line renders as before

### Requirement: REQ-4 — Plan Views and Filters Treat Disapproved Stores as Gratis

Owner plan views and the `/admin/stores` plan filter MUST behave consistently with a Gratis store for a disapproved store: the plan dialog MUST NOT show the next-due banner or active-panel highlight (`isOnPaidPlan = planType !== '' && planType !== 'Gratis'`), and the filter MUST bucket the store under Gratis. Satisfied by the REQ-1/REQ-2 contract; no additional frontend code is expected.

#### Scenario: Plan dialog hides payment banner

- GIVEN an owner opens the plan dialog for their disapproved store (`planType="Gratis"`)
- WHEN the dialog renders
- THEN no next-due banner and no active-panel highlight render

#### Scenario: Admin filter buckets disapproved store as Gratis

- GIVEN a disapproved store with `StorePlanId=Pago` listed on `/admin/stores`
- WHEN the plan-type filter is applied
- THEN the store appears under the Gratis bucket, not a paid bucket

### Requirement: REQ-5 — Billing Summary Contract Unchanged (Non-Goal Guard)

The billing engine and the `/me` summary contract (`PlanType "Free"`, `NoAplica`, null `NextDueDate`, no trial, null `PaymentBanner` for a null clock) MUST remain exactly as today. This change SHALL NOT modify `BillingService` or the summary DTO. Recorded as a guard only — no code change is scoped (non-goal).

#### Scenario: /me summary for disapproved store unchanged

- GIVEN a disapproved store with null clock and paid snapshot modules
- WHEN `GET /v1/auth/me` is called
- THEN the billing summary keeps its current `"Free"`/`NoAplica`/no-trial contract (unchanged)