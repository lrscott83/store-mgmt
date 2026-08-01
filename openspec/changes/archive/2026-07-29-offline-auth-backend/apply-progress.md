# Apply Progress: offline-auth-backend

**Date**: 2026-07-29 (base) + 2026-07-30 (evolution)
**Status**: 15/15 tasks complete — archived 2026-07-31
**Artifact store**: hybrid (this file + engram `sdd/2026-07-29-offline-auth-backend/archive-report`)

## What Was Done

All 6 phases of the offline roster export endpoint (`GET /api/v1/storeusers/{storeId}/offline-roster`) implemented and building successfully (0 errors). The feature was originally shipped with `FormatVersion = 1` (commit `4eb56c07`), then **evolved post-verification** by the SDD batch commit `42deff4b` to `FormatVersion = 2` with per-user DEK wrapping.

## Implementation Commits

| Commit | Date | What |
|--------|------|------|
| `4eb56c07` | 2026-07-29 | **Base implementation (15/15 tasks)** — `feat(backend): implement offline roster export endpoint with PBKDF2 verifier`. Added `IOfflineVerifierService` + `OfflineVerifierService` (PBKDF2-HMAC-SHA256, 210K iters), `IStoreUserRepository.GetStoreUsersByStoreIdAsync`, `IAllowedFeaturesService.GetAllowedFeatureIdsForUserAsync` overload, `ExportOfflineRosterQuery` + handler (two-layer auth), controller action, 9 unit tests + 4 E2E scenarios. |
| `42deff4b` | 2026-07-30 | **Post-verification evolution** — `fix(api): resolve bugs across stores, auth, users endpoints (SDD batch)`. FormatVersion 1→2; DEK wrapping per user (`WrappedDek`/`WrapSalt`/`WrapIv` via new `IStoreKeyWrapService` + `IStoreDataKeyProvider` — HKDF DEK from `StoreEncryption:MasterSecret`, PBKDF2 KEK + AES-GCM-128); handler loads DEK once + wraps per user; +3 E2E tests (empty store, nonexistent store, DEK stability); `RosterUserData` test DTO completed to full shape; `StoreKeyWrapServiceTests` + `StoreDataKeyProviderTests` added; main spec `openspec/specs/offline-auth/spec.md` updated (R4/R5 modified, R10–R13 added). E2E gate: **237/237 passing**. |

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1. OfflineVerifierService (PBKDF2) | 1–4 (4 tasks) | ✅ Complete |
| 2. Store-scoped roster query | 5–6 (2 tasks) | ✅ Complete |
| 3. Per-user allowed features | 7–9 (3 tasks) | ✅ Complete |
| 4. ExportOfflineRoster handler | 10–12 (3 tasks) | ✅ Complete |
| 5. Controller + E2E tests | 13–14 (2 tasks) | ✅ Complete |
| 6. Full suite verification | 15 (1 task) | ✅ Complete |

## Deviations from Design (evolution)

1. **FormatVersion 1 → 2**: The original design/handler set `formatVersion = 1`; commit `42deff4b` introduced `private const int FormatVersion = 2` in `ExportOfflineRosterQuery.cs` and updated all unit + E2E assertions from `.Be(1)` to `.Be(2)`.
2. **DEK wrapping added after verification**: New `IStoreDataKeyProvider.GetDek(storeId)` (HKDF-SHA256, called once per export) and `IStoreKeyWrapService.WrapDek(hash, dek)` (PBKDF2 KEK + AES-GCM-128, called per user). `OfflineRosterUserDto` gained `WrappedDek`/`WrapSalt`/`WrapIv`. Full design in `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/design.md`.
3. **E2E coverage expanded**: 4 → 7 scenarios (empty store, nonexistent store, DEK stability), closing both verify warnings.

## Files Changed

Base (commit `4eb56c07`):
| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/Application/Abstractions/Authentication/IOfflineVerifierService.cs` | Create | Interface + `OfflineVerifierResult` record |
| `backend/src/Application/Services/Authentication/OfflineVerifierService.cs` | Create | PBKDF2-HMAC-SHA256, 210K iters, 16B salt, 32B key |
| `backend/src/Application.Tests/Services/Authentication/OfflineVerifierServiceTests.cs` | Create | 2 tests |
| `backend/src/Domain/Interfaces/Repositories/IStoreUserRepository.cs` | Modify | +`GetStoreUsersByStoreIdAsync(Guid, bool)` |
| `backend/src/Infrastructure/Persistence/Repositories/StoreUserRepository.cs` | Modify | Store-scoped query (Include Store+User, IgnoreQueryFilters) |
| `backend/src/Application/Abstractions/Features/IAllowedFeaturesService.cs` | Modify | +`GetAllowedFeatureIdsForUserAsync(Guid, List<int>)` |
| `backend/src/Application/Services/Features/AllowedFeaturesService.cs` | Modify | +`IUserRoleRepository`, per-user overload |
| `backend/src/Application/Dtos/Management/StoreUsers/Offline{Verifier,RosterUser,Roster}Dto.cs` | Create | 3 DTOs |
| `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Create | Query + handler (auth, roster assembly, verifier per user) |
| `backend/src/Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs` | Create | 4 tests |
| `backend/src/Application.Tests/Services/Features/AllowedFeaturesServiceTests.cs` | Create | 3 tests |
| `backend/src/SMCA.WebApi/Controllers/v1/StoreUsersController.cs` | Modify | +`ExportOfflineRosterAsync` action |
| `backend/src/SMCA.WebApi/Program.cs` | Modify | `AddScoped<IOfflineVerifierService, OfflineVerifierService>()` |
| `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Create | 4 E2E scenarios |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | `RosterData`/`RosterUserData`/`VerifierData` test DTOs |

Evolution (commit `42deff4b`) — offline-auth scope:
| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` | Create | `byte[] GetDek(Guid storeId)` |
| `backend/src/Application/Abstractions/Authentication/IStoreKeyWrapService.cs` | Create | Interface + `WrappedDekResult` record |
| `backend/src/Application/Services/Authentication/StoreDataKeyProvider.cs` | Create | HKDF-SHA256 derivation, throws on empty/whitespace secret |
| `backend/src/Application/Services/Authentication/StoreKeyWrapService.cs` | Create | PBKDF2 KEK + AES-GCM-128 wrap |
| `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | Modify | +`WrappedDek`, `WrapSalt`, `WrapIv` |
| `backend/src/Application/Features/.../ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Modify | `FormatVersion = 2`; load DEK once, wrap per user |
| `backend/src/SMCA.WebApi/Program.cs` | Modify | Register both DEK services |
| `backend/src/SMCA.WebApi/appsettings.json` | Modify | +`StoreEncryption:MasterSecret` |
| `backend/src/Application.Tests/.../StoreKeyWrapServiceTests.cs` | Create | 2 tests |
| `backend/src/Application.Tests/.../StoreDataKeyProviderTests.cs` | Create | 4 tests |
| `backend/src/Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs` | Modify | 2 new mocks, FormatVersion=2 + wrap assertions, DEK-once/per-user verify |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | +wrap fields to `RosterUserData` |
| `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Modify | FormatVersion=2 asserts + 3 new tests (empty store, nonexistent store, DEK stability) |

## Issues Found

None. Build succeeded with 0 errors at both stages; E2E 237/237 and full suite 510/510 post-evolution.

---

## Archive Status

**Archived**: 2026-07-31
**Status**: ✅ Complete
**Tasks**: 15/15 complete
**Tests**: 15 offline-auth unit tests + 7 E2E scenarios; full suite 510/510; E2E suite 237/237
**Archive path**: `openspec/changes/archive/2026-07-29-offline-auth-backend/`

### Specs Synced to Main
- `offline-auth/spec.md` — updated in commit `42deff4b`: R4 modified (formatVersion=2), R5 modified (+wrap fields), R10–R13 added (DEK derivation, wrapping, handler integration, format bump). Delta spec in this change folder is superseded.
