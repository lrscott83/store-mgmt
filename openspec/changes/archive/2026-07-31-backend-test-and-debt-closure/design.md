# Design: Backend Test Gaps and Debt Closure (2026-07-31)

## Technical Approach

Close every verified debt item from the 2026-07-31 audit in four independent phases: **P1 tests** — add an independent HKDF known-answer test (T-A1), extend the existing E2E DEK-stability test to unwrap and compare DEKs (T-A2), extract the `RegisterPolicy` options for unit testing (T-A3); **P2 frontend+command** — fix `paymentStartDate` type/validator and wire an additive `UpdateStoreCommand.PaymentStartDate` (T-B1); **P3 docs** — line-targeted corrections to two active specs and one archived verify-report (T-C1/C2/C3); **P4 closure** — document T-A4 mapping only (no new test). No migrations, no new NuGet packages, all crypto via `System.Security.Cryptography` as today.

## Architecture Decisions

### T-A1 — HKDF known-answer vector: independent offline computation (verified)

**Choice**: Compute the vector manually per RFC 5869 (HKDF-Extract/Expand via raw HMAC-SHA256 primitives) with **two independent tools** — Python 3.13 `hmac` and PowerShell `HMACSHA256` — and hardcode the resulting bytes. **Alternatives**: (a) .NET `HKDF.DeriveKey` self-computation (rejected — self-referential, tests the code against itself); (b) cross-validate against a second .NET library (rejected — unnecessary, no new packages). **Rationale**: The vector is pinned to the production inputs in `StoreDataKeyProvider.cs:20` and both tools agree byte-for-byte (see Testing Strategy). **Critical subtlety**: `.NET HKDF.DeriveKey(salt: null)` substitutes HashLen (32) zero bytes as the salt per RFC 5869 §2.2 — the independent computation MUST use `salt = 32 zero bytes` or the vectors diverge.

Pinned inputs (reuse existing `MasterSecret` const to avoid config drift):

| Input | Value |
|-------|-------|
| masterSecret | `"0D5D3E5F-3E7C-4C1A-9E2B-6F1E9C4A7B20"` (existing const, UTF-8) |
| storeId | `Guid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")` (fixed) |
| info | `UTF8(storeId.ToString("D"))` = `3f2504e0-4f89-41d3-9a0c-0305e82c3301` |
| salt | `null` → 32 zero bytes |
| Expected 32B output | hex `1947de72a86a46962bf851db33476e3db6681fab9cac9f7701488ab80f0ff21f` · base64 `GUfecqhqRpYr+FHbM0duPbZoH6ucrJ93AUiKuA8P8h8=` (PRK `dfa20316…cf957` for debugging) |

### T-A2 — E2E DEK unwrap: read `User.Password` from DB, unwrap in-test

**Choice**: Extend `SuperAdmin_export_twice_DEK_stability` (already asserts wrapped blobs differ — proving fresh salt/IV) to additionally unwrap each user's `WrappedDek` from BOTH exports and assert the DEKs are byte-identical. Re-derive the KEK in-test, reading the real wrapped value `User.Password` from `ApplicationDbContext` (tests already open scopes for seeding/cleanup — reuse the pattern). **Alternatives**: recompute `DbTestHelpers.HashPassword("Password123")` (deterministic SHA256→Base64) — rejected: DB read uses the ACTUAL production input (`ExportOfflineRosterQuery.cs:102` wraps `su.User.Password`) and survives seed changes. **Rationale**: Mirrors `StoreKeyWrapServiceTests.WrapDek_round_trip_reproduces_original_dek` exactly. **Wire format verified**: `Base64(ct ‖ tag)` where ct=32B, **tag=16B** (`StoreKeyWrapService.cs:33-35`, `new AesGcm(kek, 16)`). Split `wrapped[..^16]` / `wrapped[^16..]`. Production params pinned: `Pbkdf2(UTF8(passwordHash), wrapSalt, 210_000, SHA256, 32)`, iv 12B.

### T-A3 — RegisterPolicy extraction: static policy factory class

**Choice**: Extract the two rate-limit partition factories (L117-137) into a new static class `SMCA.WebApi/PolicyCode/RateLimitPolicies.cs` exposing `Register(HttpContext)` and `Login(HttpContext)` returning `RateLimitPartition<string>`. `Program.cs` calls `options.AddPolicy("RegisterPolicy", RateLimitPolicies.Register)` — the `!IsEnvironment("Testing")` guard (L111) stays untouched (limiter NOT enabled in Testing). **Alternatives**: (a) options record + constants only (rejected — asserts constants, not behavior); (b) static-verify nothing (rejected — that's the debt). **Tradeoff**: small Program.cs touch vs. a real assertion of `PermitLimit=10, Window=10min, QueueLimit=0, SegmentsPerWindow=10, per-IP partition ("unknown" fallback)`. **Rationale**: matches existing `PolicyCode/` + `OptionsSetup/` conventions; unit test lives in `SMCA.WebApi.E2ETests` (plain `[Fact]`, no fixture — project already references `SMCA.WebApi`).

### T-B1 — paymentStartDate type, validator, and additive command wiring

| Decision | Choice | Tradeoff / Rationale |
|----------|--------|----------------------|
| Model type (`store.model.ts:12`) | `paymentStartDate: Date` → `string \| null` | `StoreDto.PaymentStartDate` is `DateOnly?` (StoreDto.cs:16) → serialized `"yyyy-MM-dd"` or `null`. No runtime mapping — service passes raw JSON |
| Edit-store validator (`edit-store.component.ts:245`) | Drop `Validators.required` → `new FormControl("")` | Date is optional for free stores; null date must save. Also remove `required` attr in `.html:57` (native validation conflict). Control remains SuperAdmin-edit-only |
| `UpdateStoreCommand` | Add positional `DateOnly? PaymentStartDate = null` at END | Additive, optional; default keeps other constructions compiling. Only in-solution call site is `StoresController.cs:101` |
| Controller `UpdatedStoreAsync` | Append `command.PaymentStartDate` to positional reconstruction | Record is rebuilt positionally — omitting it makes the property dead code |
| Validator | NO rule for `PaymentStartDate` | Optional — absent in payload must not fail |
| Handler apply | `if (request.PaymentStartDate is not null && _httpContextService.IsSuperAdmin) store.PaymentStartDate = ...` AFTER auto-activation branch | Non-null only (null preserves existing behavior); explicit beats auto-activation (spec 3c); SuperAdmin gate matches deliberate `/payment-date` endpoint semantics (controller comment L105-109: "only SuperAdmin can set this date") and the existing L84 gate block — prevents StoresAdmin writing billing data via general PUT |

**Verified**: frontend `editStore()` already PUTs `paymentStartDate` in the body (`store.service.ts:57`) — sent but ignored today (bonus finding). Dedicated `PUT /stores/{storeId}/payment-date` + `SetStorePaymentDateCommand` remain untouched.

### T-C1/C2/C3 — pure spec-text corrections (no code)

| Item | Decision |
|------|----------|
| T-C1 | Flip inverted wording: `UserRepository.cs:101` returns `!AnyAsync` → **true when login UNIQUE/absent**; fix UR1 L20 + rows 4a/4b; tick checkboxes (behavior implemented + tested) |
| T-C2 | `offline-auth/spec.md`: L234 4→7 E2E scenarios; L242 → 5/5 passing, NO known-answer test (T-A1 gap); L245 → states actual behavior (no unwrap; T-A2 adds it); L258 → PASS (R7/R8 covered by `SuperAdmin_empty_store_returns_empty_users` / `SuperAdmin_nonexistent_store_returns_empty_users`) |
| T-C3 | Archived `verify-report.md`: L105 false claim corrected (IDs #294-#300 all EXIST: proposal/spec/design/tasks/apply/apply-progress/verify-report — verified via `mem_get_observation`); L52 R10 row already PARTIAL → append "(resolved by T-A1)"; `mem_update` engram #300: R10 row COMPLIANT→PARTIAL, summary 15/15→14/15 + 1 partial |

### T-A4 — closure documentation only

`UpdateStorePaymentStartDateTests` was never created; the work became `SetStorePaymentDateCommand` (verified: command exists, handler SuperAdmin-gated, dedicated endpoint). Coverage evidence: `StoreActivationTests` 3 tests (paid→today, free→null, existing unchanged) + `PaymentDateTests` 7 tests (200/403/403/401/400/400/400) — all verified in code. Document mapping in tasks/verify; create no test file.

## Data Flow

```
T-B1: PUT /stores/{id} {…, paymentStartDate} → UpdatedStoreAsync → new UpdateStoreCommand(…, PaymentStartDate)
        → Validator (no rule) → Handler: auto-activation branch → if (date != null && IsSuperAdmin) store.PaymentStartDate = date
T-A2: GET /stores/{id}/offline-roster ×2 → roster.WrappedDek/WrapSalt/WrapIv per user
        → test: read User.Password (DB) → KEK = Pbkdf2(hash, salt, 210000, SHA256, 32)
        → AesGcm(kek,16).Decrypt(iv, ct, tag) → assert dek₁ == dek₂ (32B)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` | Modify | Add `GetDek_known_answer_matches_independent_vector` (fixed storeId, hardcoded vector above) |
| `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Modify | In `SuperAdmin_export_twice_DEK_stability`: read `User.Password` per user, unwrap both exports, assert DEK identity |
| `backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs` | Create | Static `Register`/`Login` partition factories (extracted from Program.cs L117-137) |
| `backend/src/SMCA.WebApi/Program.cs` | Modify | Replace inline policies with `RateLimitPolicies.*`; `!Testing` guard unchanged |
| `backend/src/SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` | Create | Unit tests: options values + per-IP partition (`DefaultHttpContext`) |
| `backend/src/Application/.../Commands/UpdateStore/UpdateStoreCommand.cs` | Modify | Add `DateOnly? PaymentStartDate = null` (end of record) |
| `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` | Modify | Pass `command.PaymentStartDate` in `UpdatedStoreAsync` (L101-102) |
| `frontend/src/app/domain/entities/stores/store.model.ts` | Modify | L12 `paymentStartDate: string \| null` |
| `frontend/src/app/_services/store/store.service.ts` | Modify | L50 param type → `string \| null` |
| `frontend/src/app/presentation/stores/edit-store/edit-store.component.ts` | Modify | L245 drop `Validators.required` |
| `frontend/src/app/presentation/stores/edit-store/edit-store.component.html` | Modify | L57 drop `required` attribute |
| `openspec/specs/user-repository/spec.md` | Modify | T-C1 wording flip + checkboxes |
| `openspec/specs/offline-auth/spec.md` | Modify | T-C2 L234/242/245/258 corrections |
| `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/verify-report.md` | Modify | T-C3 L105 claim + L52 T-A1 note |
| engram #300 | Update | `mem_update`: R10 COMPLIANT→PARTIAL, 14/15+1 summary |

No change: `UpdateStoreCommandValidator.cs` (no rule), `/payment-date` endpoint + `SetStorePaymentDateCommand`, `WebApiTest/` (orphaned, not in `SMCA.sln` — pre-existing).

## Interfaces / Contracts

```csharp
// UpdateStoreCommand — additive positional, default keeps existing call sites compiling
public sealed record UpdateStoreCommand(Guid Id, string Name, string? Address, string? Description,
    bool Approved, List<int> ModuleIds, bool IsActive, DateOnly? PaymentStartDate = null) : ICommand<bool>;

// RateLimitPolicies — extracted factories
public static class RateLimitPolicies {
    public static RateLimitPartition<string> Register(HttpContext context); // PermitLimit=10, 10min, 10 segments, per-IP
    public static RateLimitPartition<string> Login(HttpContext context);    // PermitLimit=5, 1min, 3 segments, per-IP
}

// T-A2 unwrap contract (matches StoreKeyWrapService)
// KEK = Rfc2898DeriveBytes.Pbkdf2(UTF8(User.Password), FromBase64(WrapSalt), 210_000, SHA256, 32)
// wrapped = FromBase64(WrappedDek); ct = wrapped[..^16]; tag = wrapped[^16..]   // tag = 16 bytes
// dek = new byte[32]; new AesGcm(kek, 16).Decrypt(FromBase64(WrapIv), ct, tag, dek)
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | HKDF known-answer (T-A1) | New `[Fact]` — fixed storeId + hardcoded vector (double-verified: Python 3.13 + PowerShell HMAC, neither uses `HKDF.DeriveKey`) |
| Unit | RegisterPolicy options (T-A3) | `RateLimitPoliciesTests` — invoke partition factory with `DefaultHttpContext`; assert `PermitLimit==10`, `Window==10min`, `QueueLimit==0`, `SegmentsPerWindow==10`; distinct IPs → distinct partition keys; null IP → `"unknown"` |
| E2E | DEK stability unwrap (T-A2) | Extend existing test — unwrap both exports per user, assert 32B DEKs identical; keep existing assertions (non-empty fields, wrapped blobs differ) |
| E2E | T-B1 regression | Existing `StoreActivationTests` (3) + `PaymentDateTests` (7) must stay green; PUT with/without `paymentStartDate` |
| Frontend | Strict TS build | `string \| null` model; null date saves; datepicker accepts ISO string |

## Migration / Rollout

No migration required — code/test/doc-local only. Rollback per-file via `git checkout`. `RegisterPolicy` behavior unchanged in every environment (extraction is behavior-preserving; limiter still disabled under Testing).

## Open Questions

- None blocking. Apply phase should re-run the Python one-liner (or openssl) to re-confirm the T-A1 vector before hardcoding — belt and suspenders, vector already double-verified here.
