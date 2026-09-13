# Delta for management-stores

**Change**: disapproved-store-billing-views · **Domain**: management-stores · **Type**: Delta (ADDED) · **Date**: 2026-09-13

Existing requirements (unified edit-store route, HTTP-only access, plan panels activation contract, etc.) are unchanged. The owner store-view surface (`GET /v1/stores/my-stores` → `OwnerStoreDto` + `owner-store-card.tsx`) gains an Approved-gated payment-visibility contract.

## ADDED Requirements

### Requirement: REQ-MS-1 — My-Stores View Hides Payment Info for Disapproved Stores

For every store with `Approved == false` returned by `GET /v1/stores/my-stores`, `OwnerStoreDto.PlanType` MUST be `"Gratis"` and `OwnerStoreDto.NextDueDate` MUST be `null`. The owner store card MUST render no price and no due date for such a store (gate key `planType === 'Gratis'`, mirroring `store-plan.tsx`), even when its module snapshot contains paid modules with prices.

#### Scenario: Disapproved paid-snapshot store on my-stores

- GIVEN the owner calls `GET /v1/stores/my-stores` and owns a disapproved store with `StorePlanId=Pago` and `PaymentStartDate=2026-01-10`
- WHEN the response is mapped to `OwnerStoreDto`
- THEN `planType` equals `"Gratis"`
- AND `nextDueDate` is `null`

#### Scenario: Owner card renders no price or date

- GIVEN the owner views a disapproved store whose snapshot has paid modules (`priceIncluded=false`, `selected=true`)
- WHEN `owner-store-card.tsx` renders
- THEN no price line and no due-date line render

#### Scenario: Approved paid store card unchanged

- GIVEN the owner views an approved store with `planType="Pago"`, paid modules, and a due date
- WHEN `owner-store-card.tsx` renders
- THEN the price and due-date lines render as before