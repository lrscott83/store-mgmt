# Delta for stores-by-current-user

**Change**: disapproved-store-billing-views · **Domain**: stores-by-current-user · **Type**: Delta (ADDED) · **Date**: 2026-09-13

Existing requirements R1–R6 (role-based filtering, OwnerName, DefaultStore exclusion, swagger/docs, 401) are unchanged. The `GET /v1/stores/by-current-user` response's `StoreDto` gains an Approved-gated plan contract, superseding the unguarded `ResolvePlanType` / `GetNextDueDate` derivation documented in exploration.

## ADDED Requirements

### Requirement: REQ-SCU-1 — StoreDto Plan Contract for Disapproved Stores

For every store with `Approved == false` in the `by-current-user` response, `StoreDto.PlanType` MUST be `"Gratis"` and `StoreDto.NextPaymentDate` MUST be `null`, regardless of `StorePlanId`, paid module snapshot, or `PaymentStartDate`. Approved stores MUST keep the existing derivation.

#### Scenario: Disapproved store with paid modules and clock

- GIVEN a SuperAdmin and a disapproved store with `StorePlanId=Pago`, `PaymentStartDate=2026-01-10`, and paid snapshot modules
- WHEN `GET /v1/stores/by-current-user` is called
- THEN that store's `planType` equals `"Gratis"`
- AND `nextPaymentDate` is `null`

#### Scenario: Approved store unchanged

- GIVEN a SuperAdmin and an approved store with `StorePlanId=Pago` and `PaymentStartDate=2026-01-10`
- WHEN the same endpoint is called
- THEN `planType` equals `"Pago"`
- AND `nextPaymentDate` equals the computed due date

#### Scenario: Non-super-admin caller sees the same contract

- GIVEN a StoresAdmin whose own disapproved store carries `StorePlanId=Pago`
- WHEN `GET /v1/stores/by-current-user` is called
- THEN `planType` equals `"Gratis"` and `nextPaymentDate` is `null` (role-independent)