# Delta for admin-stores

**Change**: disapproved-store-billing-views · **Domain**: admin-stores · **Type**: Delta (ADDED) · **Date**: 2026-09-13

Existing requirements (confirmation dialogs, card-grid chrome, lifecycle state classes, "Adicionar" copy, succeeded:false handling) are unchanged. The super-admin store card (`store-card-list.tsx`) gains an Approved-gated price-visibility contract.

## ADDED Requirements

### Requirement: REQ-AS-1 — Super-Admin Store Card Hides Price for Disapproved Stores

`store-card-list.tsx` MUST NOT render the price line for a store whose `planType` is `"Gratis"`, even when `store.modules` contains paid modules with `currentPrice` (the leak case: `PlanLine` currently prices from the module snapshot). The due-date line is already gated on `planType !== 'Gratis'`; the price line SHALL use the same key.

#### Scenario: Disapproved store with paid snapshot shows no price

- GIVEN a SuperAdmin views `/admin/stores` with a disapproved store whose snapshot has paid modules (`currentPrice` non-null) and `planType="Gratis"`
- WHEN its card renders
- THEN no price renders, and no due date renders (existing date gate)

#### Scenario: Approved paid store keeps its price

- GIVEN a SuperAdmin views an approved store with `planType="Pago"` and paid modules
- WHEN its card renders
- THEN the price line renders as before