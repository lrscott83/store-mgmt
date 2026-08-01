# Delta for store-service: paymentStartDate model, form, and command wiring (T-B1)

**Domain**: `store-service` — frontend `stores/store.model.ts`, `presentation/stores/edit-store/edit-store.component.ts`, backend `Application/.../UpdateStore/UpdateStoreCommand.cs` + Validator + `SMCA.WebApi/Controllers/v1/StoresController.cs`
**Change**: `backend-test-and-debt-closure`
**Precedent**: `StoresController.cs` L105-109 documents a deliberate separate `PUT /api/v1/stores/{storeId}/payment-date` endpoint (SuperAdmin-only, distinct semantics from general updates).

---

## MODIFIED Requirements

### BT-B1 — paymentStartDate Nullable in Frontend Model

`frontend/src/app/domain/entities/stores/store.model.ts` L12 MUST change `paymentStartDate: Date` → `paymentStartDate: string | null`. Backend `StoreDto.PaymentStartDate` is `DateOnly?` (`Application/Dtos/StoreManagement/StoreDto.cs` L16) — serialized as ISO string or null.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Null payload | GET returns `"paymentStartDate": null` | `Store` interface consumed | Field typed `string | null`; strict TS compiles |
| 1b | ISO payload | GET returns `"2026-07-15"` | Model consumed | Field is `string` |

### BT-B2 — Edit-Store Validator Relaxed for Null

`edit-store.component.ts` L245 MUST relax `new FormControl("", Validators.required)` for `paymentStartDate` so null/empty is valid (control exists only when `isSuperAdmin && editStoreId`). The `editStore` service call (L201-203) already sends `paymentStartDate` in the PUT body.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Null accepted | SuperAdmin edits store, clears date | Form validates | No `required` error; form submits |
| 2b | Date accepted | Date value provided | Form validates | Control valid — unchanged behavior |

---

## ADDED Requirements

### BT-B3 — UpdateStoreCommand Optional PaymentStartDate (Additive)

`UpdateStoreCommand` (L25) MUST gain an optional `DateOnly? PaymentStartDate` positional property. `StoresController.UpdatedStoreAsync` (L98-103) MUST pass `command.PaymentStartDate` through when reconstructing the command (positional record). Validator MUST NOT add a NotNull/NotEmpty rule on `PaymentStartDate`. Handler MUST apply `store.PaymentStartDate = request.PaymentStartDate` when non-null and preserve the existing auto-activation branch (null + paid module requested → today, L96-97); explicit value MUST win over auto-set. The separate `/payment-date` endpoint remains untouched — additive only.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Null → unchanged | PUT body without `paymentStartDate` | Handler runs | No change; auto-activation logic intact |
| 3b | Value applied | PUT with `"paymentStartDate": "2026-07-01"` (SuperAdmin) | Handler runs | `store.PaymentStartDate` persists 2026-07-01 |
| 3c | Explicit beats auto | PUT with date + paid module on null-start store | Handler runs | Explicit date wins — not overwritten with today |
| 3d | Validator additive | PUT without `paymentStartDate` | Validation runs | No `PaymentStartDate` validation error |

---

## Verification Criteria

- [ ] Frontend builds (strict TS); `paymentStartDate: string | null`; null date saves
- [ ] PUT with `paymentStartDate` persists the date; PUT without it preserves existing behavior
- [ ] Existing billing E2E suites pass: `StoreActivationTests` (3) + `PaymentDateTests` (7)
