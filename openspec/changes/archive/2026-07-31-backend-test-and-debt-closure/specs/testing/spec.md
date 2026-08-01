# Delta for testing: Backend test gaps + closure (T-A1, T-A2, T-A3, T-A4)

**Domain**: `testing` — `StoreDataKeyProviderTests.cs`, `ExportOfflineRosterTests.cs`, `Program.cs` rate-limit policy
**Change**: `backend-test-and-debt-closure`
**Precedent**: `approve-store-endpoint-fixes/specs/testing/spec.md` (test-name/assertion corrections)

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

The `RegisterPolicy` sliding-window options (Program.cs L128-137) MUST be extractable to a testable factory/const and unit-tested: `PermitLimit = 10`, `Window = TimeSpan.FromMinutes(10)`, `QueueLimit = 0`, per-IP partition key (`context.Connection.RemoteIpAddress?.ToString() ?? "unknown"`). Extraction MUST NOT enable the limiter in Testing env (registration stays under `!IsEnvironment("Testing")`, L111).

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

- [ ] `StoreDataKeyProviderTests` contains known-answer test; full Application.Tests suite green
- [ ] `SuperAdmin_export_twice_DEK_stability` unwraps both DEKs and asserts identity (7 E2E tests pass)
- [ ] Rate-limit policy unit test asserts PermitLimit=10 / Window=10min / per-IP partition
- [ ] T-A4 mapping + evidence documented in tasks/verify
