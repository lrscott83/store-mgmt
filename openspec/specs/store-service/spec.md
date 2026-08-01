# Store Service Specification

**Capability**: `CreateStoreService` batch operations and fault tolerance; store update `paymentStartDate` wiring  
**Origin**: SDD change `2026-07-30-register-endpoint-fixes` (+ delta `2026-07-31-backend-test-and-debt-closure`)  
**Status**: Active  
**Last Updated**: 2026-07-31

---

## Purpose

Define the module query and insert contract for `CreateStoreService`, eliminating N+1 patterns and adding fault tolerance for ReSeller lookups.

---

## Specification

### SS1: Batch Module Query

**Requirement**: `CreateStoreService` MUST call `GetModulesByIdsAsync(storeTypeId)` once and `AddRangeAsync` once (not N individual calls).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Single module query | N modules for store type | Service creates store | `GetModulesByIdsAsync` called ONCE, `GetByIdAsync` ZERO times |
| 5b | Single module insert | N modules for store type | Service persists modules | `AddRangeAsync` called ONCE, `AddAsync` ZERO times for modules |

### SS2: ReSeller Lookup Fault Tolerance

**Requirement**: ReSeller lookup failures MUST be logged and handled gracefully without breaking registration.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | ReSeller lookup throws | Exception in lookup | Registration flow continues | Warning logged with exception, registration succeeds |
| 7b | ReSeller null | Lookup returns null | Registration flow continues | Silent continuation, no `ReSellerOwner` created |
| 7c | ReSeller found | Valid ReSeller returned | Registration completes | `ReSellerOwner` association created |

### BT-B1 — paymentStartDate Nullable in Frontend Model

`frontend/src/app/domain/entities/stores/store.model.ts` L12 MUST use `paymentStartDate: string | null` (backend `StoreDto.PaymentStartDate` is `DateOnly?` — serialized as ISO string or null).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Null payload | GET returns `"paymentStartDate": null` | `Store` interface consumed | Field typed `string | null`; strict TS compiles |
| 1b | ISO payload | GET returns `"2026-07-15"` | Model consumed | Field is `string` |

### BT-B2 — Edit-Store Validator Relaxed for Null

`edit-store.component.ts` L245 MUST NOT require `paymentStartDate` (`new FormControl("")`); the `required` attribute on the input (`.html` L57) MUST be removed so null/empty is valid. The `editStore` service call already sends `paymentStartDate` in the PUT body.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Null accepted | SuperAdmin edits store, clears date | Form validates | No `required` error; form submits |
| 2b | Date accepted | Date value provided | Form validates | Control valid — unchanged behavior |

### BT-B3 — UpdateStoreCommand Optional PaymentStartDate (Additive)

`UpdateStoreCommand` MUST carry an optional `DateOnly? PaymentStartDate` positional property (default `null`, end of record). `StoresController.UpdatedStoreAsync` MUST pass `command.PaymentStartDate` through when reconstructing the command (positional record). The validator MUST NOT add a NotNull/NotEmpty rule on `PaymentStartDate`. The handler MUST apply `store.PaymentStartDate = request.PaymentStartDate` only when non-null AND the caller is SuperAdmin, AFTER the existing auto-activation branch (null + paid module requested → today) — explicit value MUST win over auto-set. The separate `/payment-date` endpoint remains untouched — additive only.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Null → unchanged | PUT body without `paymentStartDate` | Handler runs | No change; auto-activation logic intact |
| 3b | Value applied | PUT with `"paymentStartDate": "2026-07-01"` (SuperAdmin) | Handler runs | `store.PaymentStartDate` persists 2026-07-01 |
| 3c | Explicit beats auto | PUT with date + paid module on null-start store | Handler runs | Explicit date wins — not overwritten with today |
| 3d | Validator additive | PUT without `paymentStartDate` | Validation runs | No `PaymentStartDate` validation error |

## Verification Criteria

- [ ] Unit test verifies `GetModulesByIdsAsync` called once, `GetByIdAsync` zero times
- [ ] Unit test verifies `AddRangeAsync` called once, `AddAsync` zero times for modules
- [ ] Unit test verifies `LogWarning` called on ReSeller exception
- [ ] All 52 unit tests + 11 E2E tests pass
- [x] Frontend builds (strict TS); `paymentStartDate: string | null`; null date saves
- [x] PUT with `paymentStartDate` persists the date; PUT without it preserves existing behavior
- [x] Existing billing E2E suites pass: `StoreActivationTests` (3) + `PaymentDateTests` (7); new `StoreUpdateTests` 3b/3c cover explicit-date + explicit-beats-auto

## Related Specifications

- **generic-repository** — `AddRangeAsync` used by `CreateStoreService`
- **auth-http** — Registration flow (caller of store creation)
- **rate-limiting** — Registration rate limiting
