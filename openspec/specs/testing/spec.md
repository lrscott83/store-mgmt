# Testing: StoreApproveTests + StoreDisapproveTests

**Domain**: `testing` — `StoreApproveTests.cs`, `StoreDisapproveTests.cs`, `StoreDataKeyProviderTests.cs`, `ExportOfflineRosterTests.cs`, `RateLimitPoliciesTests.cs` (delta from `2026-07-31-backend-test-and-debt-closure`)

---

## MODIFIED Requirements

### SM-TE1 — Fix Misleading Test Name (Approve)

The test `Approve_already_approved_returns_succeeded_data_false` asserts `b.Data.Should().BeTrue()` but its name says `_false`. The name MUST be changed to `Approve_already_approved_returns_succeeded_data_true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Test name matches assertion | Existing test with `_false` suffix | Test is renamed | Name ends in `_true`, assertion stays `BeTrue()` |

### SM-TE2 — Fix Misleading Test Name (Disapprove)

The test `Disapprove_already_disapproved_returns_succeeded_data_false` asserts `b.Data.Should().BeTrue()` but its name says `_false`. The name MUST be changed to `Disapprove_already_disapproved_returns_succeeded_data_true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Test name matches assertion | Existing test with `_false` suffix | Test is renamed | Name ends in `_true`, assertion stays `BeTrue()` |

### SM-TE3 — Unknown Store Returns 404 Not Found (Approve)

The test `Approve_unknown_store_returns_400_code_Id` currently expects `HttpStatusCode.BadRequest` and error code `"Id"`. After the validator removes `StoreExists` and the handler returns 404, this test MUST be updated to expect `HttpStatusCode.NotFound`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Unknown store returns 404 | Random non-existent store ID | POST /api/v1/stores/approve | StatusCode is 404 NotFound. Error message indicates store not found (no longer error code "Id"). |

### SM-TE4 — Unknown Store Returns 404 Not Found (Disapprove)

Same change as SM-TE3 for `Disapprove_unknown_store_returns_400_code_Id`.

### SM-TE5 — Empty ID Still Returns 400

The tests `Approve_empty_id_returns_400_code_Id` and `Disapprove_empty_id_returns_400_code_Id` test `Guid.Empty` which fails structural validation (`NotNull().NotEmpty()`). Behavior is UNCHANGED — the validator still rejects `Guid.Empty` with 400 validation error.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Empty ID still 400 | POST with `Id=Guid.Empty` | Validation runs | StatusCode is 400 BadRequest (unchanged) |

---

## ADDED Requirements

### BT-TA1 — HKDF Known-Answer Test (StoreDataKeyProvider)

`StoreDataKeyProviderTests` MUST gain a known-answer test asserting `GetDek(storeId)` returns a byte-for-byte exact 32-byte array matching an independently computed vector: `HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, salt: null, info: UTF8(storeId.ToString("D")))`. The expected vector MUST be computed independently (RFC 5869-style, external tool) before hardcoding — never self-referential.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Byte-for-byte vector match | Fixed `MasterSecret` const + fixed storeId; expected 32-byte vector hardcoded | `GetDek(storeId)` is called | Returns exactly the expected bytes (BeEquivalentTo) |
| 1b | Vector guards refactors | Same fixed inputs | Provider implementation changes | Test compares against independent vector, not a re-run of the same code |

### BT-TA2 — E2E DEK Stability Unwrap Assertion

`ExportOfflineRosterTests.SuperAdmin_export_twice_DEK_stability` MUST unwrap both exports' `WrappedDek` blobs per user and assert the DEKs are IDENTICAL. Unwrap: `KEK = Rfc2898DeriveBytes.Pbkdf2(UTF8(storedPasswordHash), WrapSalt, 210_000, SHA256, 32)`; split `wrapped = ciphertext ‖ tag` (tag = last 16 bytes); `new AesGcm(kek, 16).Decrypt(WrapIv, ciphertext, tag, dek)`. `storedPasswordHash` MUST be the same hash the handler wrapped with (seeded via `DbTestHelpers.HashPassword("Password123")` — recompute deterministically). Pattern: `StoreKeyWrapServiceTests.WrapDek_round_trip_reproduces_original_dek`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | DEKs identical across exports | Two exports, same store, 2 seeded users | Unwrap `WrappedDek` of roster1[i] and roster2[i] with each user's hash + wrap salt/IV | Both DEKs identical (32 bytes) per user |
| 2b | Existing assertions preserved | — | Unwrap runs | Wrap fields still non-empty; `WrappedDek` still differs between exports (fresh salt/IV) |

### BT-TA3 — RegisterPolicy Options Unit Test

The `RegisterPolicy` sliding-window options MUST be unit-tested via the extracted `RateLimitPolicies` factory: `PermitLimit = 10`, `Window = TimeSpan.FromMinutes(10)`, `QueueLimit = 0`, per-IP partition key (`context.Connection.RemoteIpAddress?.ToString() ?? "unknown"`). Extraction MUST NOT enable the limiter in Testing env (registration stays under `!IsEnvironment("Testing")`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Config assertions | Extracted policy options | Unit test runs | PermitLimit==10, Window==10min, QueueLimit==0, SegmentsPerWindow==10 |
| 3b | Per-IP partition | Two distinct RemoteIpAddress values | Partition factory invoked | Different partition keys per IP; null IP maps to `"unknown"` |

### BT-TA4 — Close UpdateStorePaymentStartDateTests (documentation only)

No new test file. The plan item `UpdateStorePaymentStartDateTests.cs` (never created) MUST be closed in tasks/verify with mapping + evidence: behavior covered by `SetStorePaymentDateCommand` + `PUT /api/v1/stores/{storeId}/payment-date`, `SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs` (3 tests: paid-module activation sets today, free-only stays null, existing date unchanged) and `PaymentDateTests.cs` (7 tests: SuperAdmin 200, OwnerAdmin 403, ReSeller 403, unauthenticated 401, unknown store 400, empty StoreId 400, missing PaymentStartDate 400).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Mapping documented | Change tasks/verify | Closure noted | States rename mapping (`UpdateStorePaymentStartDateTests` → `SetStorePaymentDateCommand`) + lists 10 E2E tests as evidence |
| 4b | No redundant test | Apply phase | — | No `UpdateStorePaymentStartDateTests.cs` file created |

---

## Verification Criteria

- [ ] `Approve_already_approved_returns_succeeded_data_false` → renamed to `..._true`
- [ ] `Disapprove_already_disapproved_returns_succeeded_data_false` → renamed to `..._true`
- [ ] `Approve_unknown_store_returns_400_code_Id` expects 404 instead of 400
- [ ] `Disapprove_unknown_store_returns_400_code_Id` expects 404 instead of 400
- [ ] `Approve_empty_id_returns_400_code_Id` still expects 400 (unchanged)
- [ ] `Disapprove_empty_id_returns_400_code_Id` still expects 400 (unchanged)
- [ ] All tests pass after changes
- [x] `StoreDataKeyProviderTests` contains known-answer test; full Application.Tests suite green (301/301)
- [x] `SuperAdmin_export_twice_DEK_stability` unwraps both DEKs and asserts identity (7 E2E tests pass)
- [x] Rate-limit policy unit test asserts PermitLimit=10 / Window=10min / per-IP partition (4/4 pass)
- [x] T-A4 mapping + evidence documented in tasks/verify

---

## ADDED Requirements (warehouses-module, 2026-09-06)


### WM-TE1 — Catalog post-migration E2E

A NEW E2E test file MUST assert, against the migrated `smca_test` database: Module 13 row shape (all pricing flags, WMC-1), features 36/37 under module 13 (WMC-2), and that `POST /api/v1/Features/activate` stays idempotent with 36 pre-seeded (WMC-2b).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Catalog rows exact | Fixture applied migrations | Test queries Module/Feature | Module 13: Price=2, PercentDiscountPrice=100, DiscountPrice=0, PriceIncluded=false, AvailableToStore=true, IsActive=true; 36/37 under module 13 |
| 1b | Activate idempotent | Feature 36 seeded | activate endpoint called | Succeeds; feature 36 count still 1 |

### WM-TE2 — Assignment SQL re-execution E2E

A NEW E2E test file MUST seed an active store, execute the migration's per-store INSERT-SELECT SQL (extracted verbatim from the migration class) against it, and assert exact StoreModule(13) + StoreRoleFeature(2, 36/37) row shapes (WMA-1a, WMA-2a), including idempotency on second execution (WMA-1c).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Re-executed SQL matches runtime shape | Active store + owner seeded | Migration SQL runs against it | Rows match CreateStoreService-generated shape exactly (snapshot columns, TenantId, IsActive) |
| 2b | Second execution no-op | SQL already applied | SQL runs again | Zero new rows, no error |

### WM-TE3 — Runtime assignment paths E2E

A NEW E2E test file MUST assert Register (WMA-3a) and UpdateStore/ToggleStorePlan (WMA-3b/3c) assign/reactivate module 13 and OwnerAdmin features 36/37 through the normal runtime paths.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Register assigns | New registration request | Register completes | StoreModule(13) + SRF(OwnerAdmin, 36/37) exist |
| 3b | Toggle Paid→Free deactivates | Paid store with module 13 | Toggle to Free | Module 13 StoreModule.IsActive=false + SRFs deactivated |

### WM-TE4 — Billing interaction E2E

A NEW E2E test file MUST assert the module-13 billing shape: Free store with module 13 keeps PlanType "Free" and sees the module (NoAplica passes FilterForBilling); getMe for the store's OwnerAdmin exposes features 36/37 and module 13 (WMC-4a).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Free store keeps module visible | Free store (PaymentStartDate=null) with module 13 | getMe/billing queried | PlanType "Free"; module 13 + features 36/37 exposed to OwnerAdmin |
