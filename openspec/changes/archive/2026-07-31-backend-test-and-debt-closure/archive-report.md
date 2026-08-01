# Archive Report: backend-test-and-debt-closure

**Change**: `2026-07-31-backend-test-and-debt-closure`
**Archived**: 2026-07-31
**Verdict**: PASS ✅

---

## Executive Summary

Closed every debt item from the 2026-07-31 audit (`sdd/explore/debt-audit-2026-07-31`, all verified against real code) in four phases: **P1 tests** — added an independent RFC 5869-style HKDF known-answer test (T-A1, triple-verified vector: Python + PowerShell + .NET), extended `SuperAdmin_export_twice_DEK_stability` to unwrap both `WrappedDek`s and assert DEK identity (T-A2), extracted the `RegisterPolicy`/`Login` rate-limit factories into `PolicyCode/RateLimitPolicies.cs` with 4 unit tests (T-A3); **P2 frontend+command** — fixed `paymentStartDate` type (`Date` → `string | null`) and validator, wired an additive `UpdateStoreCommand.PaymentStartDate` (SuperAdmin-gated, explicit-beats-auto, T-B1); **P3 docs** — corrected inverted `user-repository` wording, 4 stale `offline-auth` verification claims, and the archived at-rest-encryption `verify-report.md` + engram #300 (T-C1/C2/C3); **P4 closure** — documented T-A4 mapping (`UpdateStorePaymentStartDateTests` → `SetStorePaymentDateCommand`, 10 E2E tests as evidence). Verification closed the two previously-UNTESTED scenarios (3b/3c) with 2 new `StoreUpdateTests` during verify. All 21/21 tasks complete; build 0 errors; Application.Tests 301/301; E2E 243/243; frontend strict-TS build exit 0.

## What Changed (4 Phases, 21 Tasks)

### P1 — Backend Tests (T-A1, T-A2, T-A3)

| Task | Description |
|------|-------------|
| 1.1 | `StoreDataKeyProviderTests.GetDek_known_answer_matches_independent_vector` — fixed storeId + `MasterSecret` const, asserts 32B == `1947de72…0ff21f` (RFC 5869, salt = 32 zero bytes) |
| 1.2 | `ExportOfflineRosterTests.SuperAdmin_export_twice_DEK_stability` — reads real `User.Password` from DB, unwraps both rosters (PBKDF2 210_000/SHA256 KEK + AES-GCM 16B tag), asserts dek₁ == dek₂ |
| 1.3 | New `PolicyCode/RateLimitPolicies.cs` — `Register` (10/10min/10 seg) + `Login` (5/1min/3 seg) partition factories |
| 1.4 | `Program.cs` delegates to `RateLimitPolicies.*`; `!IsEnvironment("Testing")` guard untouched |
| 1.5 | New `RateLimiting/RateLimitPoliciesTests.cs` — 4 `[Fact]`s: options config + per-IP partition + null-IP `"unknown"` |

### P2 — Frontend + UpdateStoreCommand (T-B1)

| Task | Description |
|------|-------------|
| 2.1 | `store.model.ts` — `paymentStartDate: string \| null` |
| 2.2 | `store.service.ts` — `editStore(...)` param type matches |
| 2.3 | `edit-store.component.ts` — dropped `Validators.required` (`new FormControl("")`) |
| 2.4 | `edit-store.component.html` — removed `required` attribute (native validation conflict) |
| 2.5 | `UpdateStoreCommand` — positional `DateOnly? PaymentStartDate = null` at END; handler applies after auto-activation branch, non-null only, `IsSuperAdmin`-gated |
| 2.6 | Validator — NO rule for `PaymentStartDate` (additive) |
| 2.7 | `StoresController.UpdatedStoreAsync` — passes `command.PaymentStartDate` (positional reconstruction) |
| 2.8 | Verify: backend build 0 errors; frontend strict-TS build 0 errors; billing E2E suites green |

### P3 — Documentation (T-C1, T-C2, T-C3)

| Task | Description |
|------|-------------|
| 3.1 | `user-repository/spec.md` — UR1 wording flipped: true = UNIQUE/absent, false = EXISTS; rows 4a/4b match code |
| 3.2 | `offline-auth/spec.md` — L234 4→7 E2E; L242 5/5 no known-answer (T-A1 gap); L245 no unwrap (T-A2); L258 PASS (R7/R8 covered) |
| 3.3 | Archived at-rest-encryption `verify-report.md` — L105 false "IDs don't exist" claim removed; L52 R10 "(resolved by T-A1)" |
| 3.4 | Engram #300 — R10 row COMPLIANT → PARTIAL; summary 15/15 → 14/15 + 1 partial |

### P4 — A4 Closure (T-A4)

| Task | Description |
|------|-------------|
| 4.1 | Closure note documented in tasks.md + verify-report.md: `UpdateStorePaymentStartDateTests` never created (by decision) → `SetStorePaymentDateCommand` + `PUT /api/v1/stores/{storeId}/payment-date`; evidence `StoreActivationTests` (3) + `PaymentDateTests` (7) |
| 4.2 | Confirmed no `UpdateStorePaymentStartDateTests.cs` file exists in repo |

## Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
2026-07-30 — Lizardo Romero Scott
```

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `testing` | Updated | Appended BT-TA1 (HKDF known-answer), BT-TA2 (E2E DEK unwrap), BT-TA3 (RegisterPolicy options), BT-TA4 (A4 closure); verification criteria checked |
| `store-service` | Updated | Appended BT-B1 (nullable model), BT-B2 (validator relaxed), BT-B3 (additive command + SuperAdmin gate); verification criteria checked |
| `user-repository` | Updated (during apply) | UR1 wording + rows 4a/4b flipped to match `!AnyAsync` semantics; checkboxes ticked (L30 honestly unticked — no dedicated unit test) |
| `offline-auth` | Updated (during apply) | L234 7 E2E, L242 5/5 no known-answer, L245 no unwrap, L258 PASS |
| `documentation` | Delta-only | Archive-artifact metadata (corrections to an archived verify-report + engram #300) — no `openspec/specs/documentation/` home exists |

Main spec paths:
- `openspec/specs/testing/spec.md` — merged (BT-TA1–TA4 appended)
- `openspec/specs/store-service/spec.md` — merged (BT-B1–B3 appended)
- `openspec/specs/user-repository/spec.md` — merge verified (already applied)
- `openspec/specs/offline-auth/spec.md` — merge verified (already applied)

## Archive Contents

| Artifact | Status |
|----------|--------|
| `proposal.md` | ✅ |
| `specs/testing/spec.md` | ✅ |
| `specs/store-service/spec.md` | ✅ |
| `specs/user-repository/spec.md` | ✅ |
| `specs/offline-auth/spec.md` | ✅ |
| `specs/documentation/spec.md` | ✅ (delta-only metadata) |
| `design.md` | ✅ |
| `tasks.md` | ✅ (21/21 tasks complete) |
| `verify-report.md` | ✅ |
| `archive-report.md` | ✅ |

## Engram Lineage

| Artifact | Observation ID |
|----------|----------------|
| proposal | #490 |
| spec (delta specs) | #491 |
| design | #492 |
| tasks | #493 |
| apply-progress | #494 |
| doc closure (P3/P4) | #495 |
| verify-report | #498 |

## Verification Summary

| Check | Result |
|-------|--------|
| Build `SMCA.sln` (0 errors) | ✅ Passed |
| Application.Tests (301/301, incl. known-answer) | ✅ Passed |
| E2E suite (243/243, incl. 2 new 3b/3c tests) | ✅ Passed |
| Frontend strict-TS build (exit 0) | ✅ Passed |
| HKDF vector triple-verified | ✅ Python + PowerShell + .NET agree |
| Tasks complete (21/21) | ✅ 100% |
| Spec compliance (22/22 scenarios; 2 ⚠️ PARTIAL frontend-form — no component-test infra, documented) | ✅ Passed |
| Comment fix (StoresController.cs L105-109) | ✅ Rephrased — general PUT carries PaymentStartDate, SuperAdmin-gated; dedicated endpoint kept for payment-date-only semantics |

## Risks / Open Items

- **None blocking.** Out-of-scope debt explicitly documented in verify-report: HTTP 429 E2E rate-limit test (limiter disabled in Testing env), aggregation-service removal (deferred from `order-offline-service-parity`), BT-B2 2a/2b frontend form-level automation (no Angular component-test infra in repo), and `StoreUpdateTests.Update_as_superadmin_with_payment_date_succeeds` naming (pre-existing, predates this change).

---

**SDD cycle complete.** The change has been fully planned, implemented, verified, and archived. Ready for the next change.
