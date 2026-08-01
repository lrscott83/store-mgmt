# Verification Report: fix-store-seed-payment-start-date

**Verified**: 2026-07-31 (backfill — artifact was missing from archive)
**Verification method**: Real code inspection at HEAD + git history + fresh build & test runs (not inherited from prior reports)
**Version**: HEAD `42deff4b`

---

## Verdict

**PASS** ✅

All 8 spec scenarios are compliant with the current codebase. Build succeeds
(0 errors). All 559 solution tests pass (0 failures, 0 skipped). All 3 design
decisions correctly implemented. All 10 tasks complete.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 10 |
| Tasks complete | 10 |
| Tasks incomplete | 0 |

All tasks in all 4 phases are complete (confirmed in Engram `#306` and by code
inspection at HEAD).

---

## Build & Tests Execution (fresh, 2026-07-31)

**Build**: ✅ Passed — `dotnet build backend/src/SMCA.sln` → 0 errors, 8 pre-existing NU190x package vulnerability warnings (unrelated: AutoMapper, System.Text.Json, RestSharp)

**Targeted test** (task 3.2): ✅ 4/4 passed

```
Passed!  - Failed: 0, Passed: 4, Skipped: 0, Total: 4 - SMCA.WebApi.E2ETests.dll (net8.0)
```

**Full solution regression** (task 4.1): ✅ 559/559 passed

```
Passed!  - Failed: 0, Passed:   22, Skipped: 0, Total:   22 - Domain.UnitTests.dll (net8.0)
Passed!  - Failed: 0, Passed:  300, Skipped: 0, Total:  300 - Application.Tests.dll (net8.0)
Passed!  - Failed: 0, Passed:  237, Skipped: 0, Total:  237 - SMCA.WebApi.E2ETests.dll (net8.0)
```

**Coverage**: ➖ Not configured

---

## Spec Compliance Matrix

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| StoreDto.PaymentStartDate nullable | Free store → `null` | `StoreGetByIdTests.cs` line 31 `.BeNull()` → test PASS (fresh run) | ✅ COMPLIANT |
| StoreDto.PaymentStartDate nullable | Paid store → actual date | Billing E2E green (e.g., `StoreActivationTests` asserts `Be(new DateOnly(2026,7,15))`, `PaymentDateTests`); all 237 E2E pass | ✅ COMPLIANT |
| StoreSeed no PaymentStartDate for free stores | `SeedStoreAsync` | `StoreSeed.cs` line 45: `Store.Create(name, owner.OwnerId, approved, DataUtils.DefaultTenant.Id)` — no 5th arg | ✅ COMPLIANT |
| StoreSeed no PaymentStartDate for free stores | `SeedStoresAdminUserAsync` | `StoreSeed.cs` line 64: `Store.Create($"SA-Store-...", owner.Id, false, tenantId)` — no 5th arg | ✅ COMPLIANT |
| StoreSeed no PaymentStartDate for free stores | `SeedStoreInNewTenantAsync` | `StoreSeed.cs` line 86: `Store.Create($"T2-Store-...", owner.Id, false, tenant.Id)` — no 5th arg | ✅ COMPLIANT |
| Regression — billing E2E pass | Billing suite (BillingSeed) | Full solution run: 237/237 E2E pass | ✅ COMPLIANT |
| Regression — store CRUD E2E pass | Store CRUD suite (StoreSeed) | Full solution run: 237/237 E2E pass | ✅ COMPLIANT |
| Regression — unit tests pass | All unit tests | Full solution run: 22 Domain + 300 Application pass | ✅ COMPLIANT |

**Compliance summary**: 8/8 scenarios compliant

---

## Correctness (Static — Structural Evidence at HEAD)

| Item | Status | Notes |
|------|--------|-------|
| `StoreDto.PaymentStartDate` → `DateOnly?` | ✅ Implemented | `StoreDto.cs` line 16 |
| `TestDtos.StoreData.PaymentStartDate` → `DateOnly?` | ✅ Implemented | `TestDtos.cs` line 22 |
| `StoreSeed` — drop paymentStartDate arg (`SeedStoreAsync`) | ✅ Implemented | line 45, 4 args only |
| `StoreSeed` — drop paymentStartDate arg (`SeedStoresAdminUserAsync`) | ✅ Implemented | line 64, 4 args only |
| `StoreSeed` — drop paymentStartDate arg (`SeedStoreInNewTenantAsync`) | ✅ Implemented | line 86, 4 args only |
| Assertion `.BeNull()` instead of `.Be(today)`; `today` var removed | ✅ Implemented | `StoreGetByIdTests.cs` line 31; no unused `today` |

Git-verified: changes landed in `abe067ec` (StoreDto.cs) and `42deff4b`
(TestDtos.cs, StoreSeed.cs, StoreGetByIdTests.cs), both 2026-07-30.

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| DD1: Null as default — drop explicit `paymentStartDate` from `Store.Create()` | ✅ Yes | Domain `Store.cs` line 33: `DateOnly? PaymentStartDate { get; set; } = null;` + `paymentStartDate = null` param default (line 35); all 3 seed calls drop the arg |
| DD2: `StoreDto.PaymentStartDate` → `DateOnly?` | ✅ Yes | Both `StoreDto.cs` and `TestDtos.cs` updated; JSON now `"paymentStartDate": null` for free stores |
| DD3: No data migration | ✅ Yes | Backfill `20260728194358_Backfill-PaymentStartDate-Null` already converts sentinel → NULL (`PaymentStartDateBackfill.cs`); no migration changes in this change set |

---

## Issues Found

**CRITICAL** (must fix): None

**WARNING**: None

**SUGGESTION / notes for the record**:

1. **Test count grew since archive**: archive-report states 230/230; HEAD has
   559/559. The implementation landed inside broader SDD-batch commits that
   added further tests. Current state is what matters — all green.
2. **Sentinel representation**: design/spec describe the sentinel as
   `0001-01-01`; the backfill migration SQL uses `'-infinity'::date`
   (`PaymentStartDateBackfill.cs` line 6), which is how Npgsql stores
   `DateOnly.MinValue` in PostgreSQL. Same sentinel, two representations — docs
   nuance only, no code discrepancy.
3. **Design open question (DD2 risk) — frontend consumers**: verified at HEAD:
   - `frontend-react` (active app): `packages/domain/src/models/store.ts`
     line 37 already declares `paymentStartDate: string | null` → no break, and
     `store-http-service.test.ts` explicitly covers the null passthrough case.
   - `frontend/` (legacy Angular 21 app): `store.model.ts` line 12 types
     `paymentStartDate: Date` (non-nullable). If that app consumes the store
     API response, null can flow into `Date`-typed fields. TypeScript typing
     does not crash at runtime; residual low-likelihood risk, out of scope for
     this backend change. Recommend a follow-up to widen the legacy model.
4. **Timeline oddity**: archive folder and Engram apply/verify reports are dated
   2026-07-29, but the implementation commits are dated 2026-07-30 — reports
    were persisted before the code landed in git. Code reality at HEAD is what
    was verified here.

---

## Verification Artifacts

- Real code at HEAD: `StoreDto.cs`, `TestDtos.cs`, `StoreSeed.cs`, `StoreGetByIdTests.cs`
- Git history: `abe067ec`, `42deff4b`
- Fresh runs: full solution build + 559 tests + targeted `StoreGetByIdTests`
- Historical Engram records (cross-checked, consistent): `#307` apply, `#308` verify-report
