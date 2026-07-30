# Proposal: At-Rest Encryption Backend

## Intent

Extend the offline roster export (`GET /api/v1/StoreUsers/{storeId}/offline-roster`) so the backend wraps a per-store Data Encryption Key (DEK) under each user's password-derived key and returns it in a `FormatVersion: 2` bundle. This enables the PWA to encrypt local business data at rest.

## Scope

### In Scope
- 2 new services: `IStoreKeyWrapService` (PBKDF2 KEK + AES-GCM wrap) and `IStoreDataKeyProvider` (HKDF-SHA256 per-store DEK)
- DI registration & config (`StoreEncryption:MasterSecret`)
- `OfflineRosterUserDto` — add `WrappedDek`, `WrapSalt`, `WrapIv`
- `ExportOfflineRosterQueryHandler` — inject 2 new services, load DEK once, wrap per user, bump `FormatVersion` to 2
- Unit tests for new services + handler test updates + E2E test updates
- Round-trip E2E test proving DEK stability across exports

### Out of Scope
- No DB changes, no EF migration, no new columns on `Store`/`User`
- No online auth changes (`POST /login`, `/me`, 35-day session untouched)
- No frontend changes
- No DEK rotation or versioning (DEK is stable per store by construction)

## Approach

**Stateless key derivation.** `StoreDataKeyProvider` derives a stable 32-byte DEK per store via `HKDF-SHA256(serverMasterSecret, info=storeId)`. `StoreKeyWrapService` wraps that DEK per user: `KEK = PBKDF2(user.Password, wrapSalt, 210000, SHA256)` → `AES-GCM(kek, iv).Encrypt(dek)` → `ciphertext ‖ tag`. All crypto uses built-in `System.Security.Cryptography` — no new NuGet.

## Key Architecture Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | HKDF-derived DEK (Decision A) | No DB column, no migration, stateless. Rejected stored DEK column (Decision B). |
| D2 | Config via `StoreEncryption:MasterSecret` | Follows existing `Jwt:SecretKey` pattern in `appsettings.json` |
| D3 | `AddScoped` registration | Matches existing service DI pattern (lines 58-59) |
| D4 | FormatVersion `1` → `2` | Bundle version bump signals encrypted-capable payload to the PWA |

## Affected Areas

| Area | Action | File |
|------|--------|------|
| `IStoreKeyWrapService` + `WrappedDekResult` | **Create** | `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` |
| `StoreKeyWrapService` | **Create** | `Application/Services/Authentication/StoreKeyWrapService.cs` |
| `IStoreDataKeyProvider` | **Create** | `Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` |
| `StoreDataKeyProvider` | **Create** | `Application/Services/Authentication/StoreDataKeyProvider.cs` |
| `StoreKeyWrapServiceTests` | **Create** | `Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs` |
| `StoreDataKeyProviderTests` | **Create** | `Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` |
| `OfflineRosterUserDto` | **Modify** | `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` |
| `ExportOfflineRosterQuery.cs` | **Modify** | `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` |
| `ExportOfflineRosterQueryHandlerTests.cs` | **Modify** | `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` |
| `appsettings.json` | **Modify** | `SMCA.WebApi/appsettings.json` |
| `Program.cs` | **Modify** | `SMCA.WebApi/Program.cs` (line 60, after L58-59) |
| `TestDtos.cs` | **Modify** | `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` |
| `ExportOfflineRosterTests.cs` | **Modify** | `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` |

## ⚠️ Critical Mismatches vs. Reference Plan

The reference plan (`docs/plans/2026-07-25-at-rest-encryption-backend-plan.md`) contains path/field inaccuracies. **Apply phase MUST use these corrections:**

| # | Plan says | Actual code | Action |
|---|-----------|-------------|--------|
| M1 | `Management/ExportOfflineRosterTests.cs` | `Users/ExportOfflineRosterTests.cs` | Fix path |
| M2 | `_verifier` field | `_offlineVerifierService` field | Use actual field name |
| M3 | `query.StoreId` in test setups | `_storeId` field (class-level) | Use `_storeId` |
| M4 | `FormatVersion = 1` is var | It's a literal `1` on `OfflineRosterDto` init (line 121) | Change to `FormatVersion = 2` |
| M5 | DI at "line 57" | `AddScoped<IHashPasswordService>` is at **line 58**, `IOfflineVerifierService` at **line 59** | Register new services at **line 60** |
| M6 | — | 4 existing handler tests all call `CreateHandler` | All 4 need new `IStoreKeyWrapService` + `IStoreDataKeyProvider` mocks |
| M7 | Test asserts `.Be(1)` | Handler test L108 and E2E test L43 assert `FormatVersion.Should().Be(1)` | Change to `.Be(2)` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PBKDF2 210k iterations slow per user | Low (only on export) | DEK loaded once, wrapping is per-user; roster export is admin-only, not user-facing |
| Config secret missing in E2E host | Med | Add `StoreEncryption:MasterSecret` to test fixture or fallback default |
| Cross-platform crypto byte mismatch (PBKDF2/AES-GCM) | Low | Same `System.Security.Cryptography` APIs on both platforms; E2E round-trip test validates |
| Plan path/field mismatches cause apply errors | High | **All 7 mismatches documented above — apply phase MUST check before editing** |

## Rollback Plan

1. Revert `FormatVersion` from `2` to `1`
2. Remove 3 wrap fields from `OfflineRosterUserDto`
3. Remove 2 service DI registrations from `Program.cs`
4. Remove `StoreEncryption:MasterSecret` from `appsettings.json`
5. Delete 4 new service files + 2 new test files
6. Revert handler test mocks and E2E assertions

## Dependencies

- **Offline-auth backend** must be implemented first (creates `OfflineRosterUserDto`, `ExportOfflineRosterQueryHandler`, handler test, E2E test, `TestDtos`)
- .NET 8 built-in crypto only (`System.Security.Cryptography.AesGcm`, `Rfc2898DeriveBytes`, `HKDF`, `RandomNumberGenerator`)

## Success Criteria

- [ ] `WrapDek` round-trips: unwrap(service.WrapDek(hash, dek)) == dek
- [ ] `GetDek` is deterministic per store and differs per store
- [ ] Handler returns `FormatVersion == 2` with non-empty `wrappedDek`/`wrapSalt`/`wrapIv` per user
- [ ] DEK is loaded exactly once per export (not per user)
- [ ] E2E: export twice → unwrap both → DEKs are identical
- [ ] All existing tests pass (no regressions)
