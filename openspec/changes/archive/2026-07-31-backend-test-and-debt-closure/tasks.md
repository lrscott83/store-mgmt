# Tasks: Backend Test Gaps and Debt Closure

## Phase 1: Backend Tests (T-A1, T-A2, T-A3)

- [x] 1.1 (T-A1) `backend/src/Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` — add `[Fact]` `GetDek_known_answer_matches_independent_vector`: fixed storeId `Guid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")` + existing `MasterSecret` const; assert 32 bytes == hex `1947de72a86a46962bf851db33476e3db6681fab9cac9f7701488ab80f0ff21f` (re-confirm via Python/openssl before hardcoding)
- [x] 1.2 (T-A2) `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` — in `SuperAdmin_export_twice_DEK_stability`: per user read `User.Password` from `ApplicationDbContext` scope; unwrap both rosters' `WrappedDek` (KEK = `Pbkdf2(hash, WrapSalt, 210_000, SHA256, 32)`; `ct = wrapped[..^16]`, `tag = wrapped[^16..]`; `AesGcm(kek, 16).Decrypt(WrapIv, ct, tag, dek)`); assert dek₁ == dek₂ (32B); keep existing wrap-field assertions
- [x] 1.3 (T-A3) Create `backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs` — static class with `Register(HttpContext)` / `Login(HttpContext)` returning `RateLimitPartition<string>` (extract Program.cs L117-137 verbatim; per-IP key, `"unknown"` fallback)
- [x] 1.4 (T-A3) `backend/src/SMCA.WebApi/Program.cs` — replace inline RegisterPolicy factory with `RateLimitPolicies.Register`; leave `!IsEnvironment("Testing")` guard (L111) untouched
- [x] 1.5 (T-A3) Create `backend/src/SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` — `[Fact]`s with `DefaultHttpContext`: PermitLimit==10, Window==10min, QueueLimit==0, SegmentsPerWindow==10; distinct IPs → distinct keys; null IP → `"unknown"`
- [x] 1.6 Verify: `dotnet test backend/src/Application.Tests` (T-A1 green) + `dotnet test backend/src/SMCA.WebApi.E2ETests` (7 E2E incl. T-A2 green)

## Phase 2: Frontend + UpdateStoreCommand (T-B1, T-B2, T-B3, T-B4)

- [x] 2.1 (T-B1) `frontend/src/app/domain/entities/stores/store.model.ts` L12 — `paymentStartDate: Date` → `paymentStartDate: string | null`
- [x] 2.2 (T-B1) `frontend/src/app/_services/store/store.service.ts` L50 — `editStore(...)` param `paymentStartDate: Date` → `string | null`
- [x] 2.3 (T-B2) `frontend/src/app/presentation/stores/edit-store/edit-store.component.ts` L245 — drop `Validators.required`: `new FormControl("", Validators.required)` → `new FormControl("")`
- [x] 2.4 (T-B2) `frontend/src/app/presentation/stores/edit-store/edit-store.component.html` L57 — remove `required` attribute on paymentStartDate input (native validation conflict)
- [x] 2.5 (T-B3) `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` — add positional `DateOnly? PaymentStartDate = null` at END of record (L25); in handler (L29+): after auto-activation branch, `if (request.PaymentStartDate is not null && _httpContextService.IsSuperAdmin) store.PaymentStartDate = request.PaymentStartDate`
- [x] 2.6 (T-B3) `UpdateStoreCommandValidator.cs` — add NO rule for `PaymentStartDate` (verify absent payload still validates — additive only)
- [x] 2.7 (T-B4) `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` `UpdatedStoreAsync` (L101-102) — append `command.PaymentStartDate` to positional record reconstruction (CRITICAL — omit makes property dead code)
- [x] 2.8 Verify: `dotnet build backend/src/SMCA.sln` 0 errors; `npm run build` (frontend, strict TS) 0 errors; E2E `StoreActivationTests` (3) + `PaymentDateTests` (7) green; manual PUT with/without `paymentStartDate`

## Phase 3: Documentation (T-C1, T-C2, T-C3)

- [x] 3.1 (T-C1) `openspec/specs/user-repository/spec.md` — flip UR1 L20 wording: true = UNIQUE/absent, false = EXISTS; fix table rows 4a/4b; tick verification checkboxes
- [x] 3.2 (T-C2) `openspec/specs/offline-auth/spec.md` — L234: 4 → 7 E2E scenarios; L242: 5/5 passing, NO known-answer test (T-A1 gap); L245: states no unwrap (T-A2 pending); L258: PASS (R7/R8 covered)
- [x] 3.3 (T-C3) `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/verify-report.md` — L105: remove false "engram IDs don't exist" claim, state #294-#300 exist with artifact mapping; L52: R10 row append "(resolved by T-A1)"
- [x] 3.4 (T-C3) Engram #300 — `mem_update` observation 300: R10 row COMPLIANT → PARTIAL "(resolved by T-A1)"; summary 15/15 → 14/15 + 1 partial
- [x] 3.5 Verify: grep the 4 corrected lines in offline-auth + user-repository + archived verify-report; confirm checkboxes ticked

## Phase 4: A4 Closure (T-A4)

- [x] 4.1 Document in this tasks.md (below) + upcoming `verify-report.md`: `UpdateStorePaymentStartDateTests` never created → behavior covered by `SetStorePaymentDateCommand` + `PUT /api/v1/stores/{storeId}/payment-date`; evidence: `StoreActivationTests` (3: paid→today, free→null, existing unchanged) + `PaymentDateTests` (7: 200/403/403/401/400/400/400)
- [x] 4.2 Verify: no `UpdateStorePaymentStartDateTests.cs` file exists in repo; closure note present in tasks.md and verify-report.md

---

## T-A4 Closure Note (written during apply)

The planned unit test file `UpdateStorePaymentStartDateTests.cs` (from `docs/superpowers/plans/2026-07-25-store-paid-plan-billing-backend.md`) was **never created — by decision** (spec BT-TA4 4b). The plan item was renamed/delivered as `SetStorePaymentDateCommand` + a dedicated SuperAdmin-only `PUT /api/v1/stores/{storeId}/payment-date` endpoint (handler SuperAdmin-gated, verified in code). Coverage evidence: `SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs` (3 tests: paid-module activation sets today, free-only stays null, existing date unchanged) + `PaymentDateTests.cs` (7 tests: SuperAdmin 200, OwnerAdmin 403, ReSeller 403, unauthenticated 401, unknown store 400, empty StoreId 400, missing PaymentStartDate 400) = 10 E2E tests covering the payment-date behavior. No new unit test file required. The upcoming `verify-report.md` for this change MUST include this mapping + evidence (spec BT-TA4 4a/4b).
