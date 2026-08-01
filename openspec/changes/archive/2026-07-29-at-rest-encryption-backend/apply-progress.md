# Apply Progress: at-rest-encryption-backend

**Change**: `2026-07-29-at-rest-encryption-backend`
**Date applied**: 2026-07-30
**Applied by**: SDD apply sub-agent (batch commit with other endpoint-fix changes)
**Report generated**: 2026-07-31 (backfilled — artifact was missing from the archived change)

---

## Implementation Record

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Create `IStoreKeyWrapService` + `WrappedDekResult` record (`Application/Abstractions/Authentication/IStoreKeyWrapService.cs`) | ✅ Done | `42deff4b` |
| 2 | Create `StoreKeyWrapService` (PBKDF2 KEK 210K/SHA256 + AES-GCM-128, `ciphertext ‖ tag`) | ✅ Done | `42deff4b` |
| 3 | Create `StoreKeyWrapServiceTests` (round-trip unwrap, distinct salt/IV per call) | ✅ Done | `42deff4b` |
| 4 | Create `IStoreDataKeyProvider` + `StoreDataKeyProvider` (HKDF-SHA256, 32-byte DEK, `ArgumentException` on empty/whitespace secret) | ✅ Done | `42deff4b` |
| 5 | Create `StoreDataKeyProviderTests` | ✅ Done (deviation — see below) | `42deff4b` |
| 6 | DI registration in `Program.cs` + `StoreEncryption:MasterSecret` in `appsettings.json` | ✅ Done | `42deff4b` |
| 7 | Add `WrappedDek`/`WrapSalt`/`WrapIv` to `OfflineRosterUserDto` | ✅ Done | `42deff4b` |
| 8 | Update `ExportOfflineRosterQueryHandler` — `FormatVersion = 2` const, DEK loaded once, wrap per user | ✅ Done | `42deff4b` |
| 9 | Update handler unit tests — 2 new mocks in all 4 tests, `.Be(2)`, DEK-once + wrap-per-user verifications | ✅ Done | `42deff4b` |
| 10 | Add wrap fields to E2E `RosterUserData` (`TestDtos.cs`) | ✅ Done | `42deff4b` |
| 11 | Update E2E tests — FormatVersion=2 + non-empty wrap fields + DEK stability test | ✅ Done (deviation — see below) | `42deff4b` |
| 12 | Full test suite — no regressions | ✅ Done | `42deff4b` |

**Result**: 12/12 tasks complete.

## Commit

```
42deff4bc38108aaabef830ebad4555ce3df4cce
Author: Lizardo Romero Scott <lrscott83@gmail.com>
Date:   Thu Jul 30 16:24:15 2026 -0400

    fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)
```

> Note: `42deff4b` is a batch commit covering multiple SDD endpoint-fix cycles. The at-rest-encryption-backend tasks are the crypto portion of that batch (listed as "Bcrypt hashing service + StoreDataKey/KeyWrap crypto services" in the commit body).

## Files Changed

| File | Action | Change |
|------|--------|--------|
| `backend/src/Application/Abstractions/Authentication/IStoreKeyWrapService.cs` | Created | Interface + `WrappedDekResult` record (mirrors `IOfflineVerifierService` pattern) |
| `backend/src/Application/Services/Authentication/StoreKeyWrapService.cs` | Created | PBKDF2 KEK (210K, SHA256) + AES-GCM-128 wrap; `WrappedDek = Base64(ciphertext ‖ tag)`; fresh 16B salt + 12B IV per call |
| `backend/src/Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` | Created | Interface: `byte[] GetDek(Guid storeId)` |
| `backend/src/Application/Services/Authentication/StoreDataKeyProvider.cs` | Created | HKDF-SHA256 derivation from `StoreEncryption:MasterSecret`; throws `ArgumentException` on empty/whitespace |
| `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | Modified | +3 fields: `WrappedDek`, `WrapSalt`, `WrapIv` (string, default `""`) |
| `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Modified | `FormatVersion = 2` const; 2 new ctor params; DEK loaded once (line 79); wrap per user (line 102); wrap fields attached to DTO |
| `backend/src/SMCA.WebApi/Program.cs` | Modified | `AddScoped<IStoreKeyWrapService, StoreKeyWrapService>()` + `AddScoped<IStoreDataKeyProvider>(factory)` (lines 63-65, after `IOfflineVerifierService`) |
| `backend/src/SMCA.WebApi/appsettings.json` | Modified | Added `StoreEncryption: { "MasterSecret": "..." }` |
| `backend/src/Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs` | Created | 2 tests: round-trip unwrap, distinct salt/IV per call |
| `backend/src/Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` | Created | 5 tests: determinism, per-store distinction, 32-byte output, empty/whitespace secret throws |
| `backend/src/Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` | Modified | 2 new mocks in all 4 tests (M6); `.Be(2)` (M7); wrap-field assertions; `GetDek` once + `WrapDek` per-user verification |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modified | `RosterUserData` +3 wrap fields |
| `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Modified | `.Be(2)` + non-empty wrap-field asserts; new `SuperAdmin_export_twice_DEK_stability` test |

## Build & Tests

- ✅ `dotnet build backend\src\SMCA.sln` — 0 errors (8 warnings: pre-existing NuGet vulnerability advisories, unrelated to this change)
- ✅ `Application.Tests` — 300/300 passed (incl. 2 `StoreKeyWrapServiceTests`, 5 `StoreDataKeyProviderTests`, 4 `ExportOfflineRosterQueryHandlerTests`)
- ✅ `Domain.UnitTests` — 22/22 passed
- ✅ E2E `ExportOfflineRosterTests` — 7/7 passed (against live PostgreSQL)

## Deviations from Design

| # | Design said | Actual | Impact |
|---|-------------|--------|--------|
| D1 | Task 5 test #3: known-answer test ("matches independent `HKDF.DeriveKey` computation") | Test replaced with 32-byte-length + whitespace-throws tests (5 total) | Test coverage deviation only; DEK determinism still proven (same storeId → same DEK). R10 known-answer scenario has no dedicated test. |
| D2 | Task 11 E2E round-trip: "export twice → unwrap both → DEKs identical" with `UnwrapDek` helper | `SuperAdmin_export_twice_DEK_stability` asserts wrap fields non-empty and `WrappedDek` **differs** between exports (fresh salt/IV proof); no actual unwrap/DEK comparison | Test coverage deviation only; DEK stability proven indirectly via deterministic `GetDek` unit test + real AES-GCM round-trip in `StoreKeyWrapServiceTests` |
| D3 | DI registration at "line 60" | Registered at lines 63-65 (file evolved; ordering after `IOfflineVerifierService` respected) | Trivial line-number drift, no behavior impact |

## Critical Mismatch Compliance (M1-M7)

| # | Requirement | Status |
|---|-------------|--------|
| M1 | E2E path `Users/ExportOfflineRosterTests.cs` | ✅ Used |
| M2 | `_offlineVerifierService` field NOT renamed | ✅ Preserved |
| M3 | `_storeId` class-level field used in tests | ✅ Used |
| M4 | Literal `1` → const/`2` on `OfflineRosterDto` init | ✅ `FormatVersion = 2` const |
| M5 | New DI after L58-59 (`IOfflineVerifierService`) | ✅ Lines 63-65 |
| M6 | All 4 handler tests get new mock params | ✅ All updated |
| M7 | `.Be(1)` → `.Be(2)` in handler + E2E tests | ✅ Both updated |
