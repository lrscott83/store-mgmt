# Task Breakdown: At-Rest Encryption Backend

> Generated: 2026-07-29
> Phase: tasks
> Status: draft

## Summary

12 tasks across 4 phases implementing at-rest encryption on the offline roster export.

## Files Changed

| Action | Files |
|--------|-------|
| CREATE | `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` |
| CREATE | `Application/Services/Authentication/StoreKeyWrapService.cs` |
| CREATE | `Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` |
| CREATE | `Application/Services/Authentication/StoreDataKeyProvider.cs` |
| CREATE | `Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs` |
| CREATE | `Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` |
| MODIFY | `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` |
| MODIFY | `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` |
| MODIFY | `SMCA.WebApi/Program.cs` |
| MODIFY | `SMCA.WebApi/appsettings.json` |
| MODIFY | `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` |
| MODIFY | `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` |
| MODIFY | `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` |

## Critical Mismatches (Plan vs Actual)

Apply phase MUST use these corrections:

| # | Plan says | Actual code |
|---|-----------|-------------|
| M1 | `Management/ExportOfflineRosterTests.cs` | `Users/ExportOfflineRosterTests.cs` |
| M2 | `_verifier` field in handler | `_offlineVerifierService` field — do NOT rename |
| M3 | `query.StoreId` in handler tests | `_storeId` class-level field |
| M4 | FormatVersion = 1 is a var | Literal `1` on `OfflineRosterDto` init (L121) |
| M5 | DI at "line 57" | L58: `IHashPasswordService`, L59: `IOfflineVerifierService` — new at **line 60** |
| M6 | Only success test needs mocks | ALL 4 tests call `CreateHandler()` — all need new mock params |
| M7 | Assert `.Be(1)` | Handler test L108 `.Be(1)`, E2E test L43 `.Be(1)` → `.Be(2)` |

---

## Phase 1: Crypto Services

### Task 1 — IStoreKeyWrapService + WrappedDekResult record

- **File**: `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` (CREATE)
- **Pattern**: Mirror `IOfflineVerifierService.cs` — same namespace, `sealed record` co-located with interface
- **Content**:
  ```csharp
  namespace Application.Abstractions.Authentication;
  public sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv);
  public interface IStoreKeyWrapService
  {
      WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek);
  }
  ```
- **Depends**: None
- **Verify**: `dotnet build backend/src/Application/Application.csproj`

### Task 2 — StoreKeyWrapService

- **File**: `Application/Services/Authentication/StoreKeyWrapService.cs` (CREATE)
- **Pattern**: Mirror `OfflineVerifierService.cs` — sealed class, constants, `RandomNumberGenerator.GetBytes`, `Rfc2898DeriveBytes.Pbkdf2`, `AesGcm`
- **Crypto params**:
  - KEK: `Rfc2898DeriveBytes.Pbkdf2(UTF8(storedPasswordHash), salt, 210_000, SHA256, 32)`
  - Salt: 16 random bytes, IV: 12 random bytes
  - AEAD: `new AesGcm(kek, 16)` (tag-size ctor REQUIRED on net8)
  - Wrapped layout: `ciphertext ‖ tag` (tag = last 16 bytes, total 48 for 32-byte DEK)
- **Depends**: Task 1
- **Verify**: `dotnet build backend/src/Application/Application.csproj`

### Task 3 — StoreKeyWrapServiceTests

- **File**: `Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs` (CREATE)
- **Pattern**: Mirror `OfflineVerifierServiceTests.cs`
- **Tests** (2):
  1. `WrapDek_output_unwraps_back_to_the_same_dek` — generate random 32-byte DEK, wrap, reconstruct KEK, AES-GCM decrypt, assert recovered == original
  2. `WrapDek_uses_a_fresh_salt_and_iv_each_call` — same hash + same DEK → WrapSalt, WrapIv, WrappedDek all differ
- **Depends**: Task 2
- **Verify**: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreKeyWrapServiceTests"`

### Task 4 — IStoreDataKeyProvider + StoreDataKeyProvider

- **Files**:
  - `Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` (CREATE) — interface only
  - `Application/Services/Authentication/StoreDataKeyProvider.cs` (CREATE)
- **Interface**: `byte[] GetDek(Guid storeId)`
- **Impl**: Ctor takes `string masterSecret`, throws `ArgumentException` if empty/whitespace. GetDek: `HKDF.DeriveKey(SHA256, UTF8(masterSecret), 32, null, UTF8(storeId.ToString("D")))`
- **DEK**: 32 bytes, deterministic per storeId
- **Depends**: None
- **Verify**: `dotnet build backend/src/Application/Application.csproj`

### Task 5 — StoreDataKeyProviderTests

- **File**: `Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` (CREATE)
- **Tests** (4):
  1. `GetDek_is_deterministic_for_the_same_store` — same storeId → same DEK
  2. `GetDek_differs_per_store` — different storeId → different DEK
  3. `GetDek_matches_independent_hkdf_computation` — known-answer test
  4. `Ctor_throws_when_master_secret_missing` — `""` → `ArgumentException`
- **Depends**: Task 4
- **Verify**: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreDataKeyProviderTests"`

### Task 6 — DI Registration

- **Files**:
  - `SMCA.WebApi/Program.cs` (MODIFY, after L59)
  - `SMCA.WebApi/appsettings.json` (MODIFY)
- **Program.cs changes** (line 60):
  ```csharp
  builder.Services.AddScoped<IStoreKeyWrapService, StoreKeyWrapService>();
  builder.Services.AddScoped<IStoreDataKeyProvider>(_ =>
      new StoreDataKeyProvider(builder.Configuration.GetValue<string>("StoreEncryption:MasterSecret")!));
  ```
- **appsettings.json** (add top-level section after `Jwt`):
  ```json
  "StoreEncryption": {
    "MasterSecret": "0D5D3E5F-3E7C-4C1A-9E2B-6F1E9C4A7B20"
  }
  ```
- **Depends**: Task 1 + Task 4
- **Verify**: `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj`

---

## Phase 2: DTO + Handler Changes

### Task 7 — Add wrap fields to OfflineRosterUserDto

- **File**: `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` (MODIFY)
- **Add after `Verifier`**:
  ```csharp
  public string WrappedDek { get; set; } = string.Empty;
  public string WrapSalt { get; set; } = string.Empty;
  public string WrapIv { get; set; } = string.Empty;
  ```
- **Serialization**: camelCase → `wrappedDek`, `wrapSalt`, `wrapIv`
- **Depends**: None
- **Verify**: `dotnet build backend/src/Application/Application.csproj`

### Task 8 — Update ExportOfflineRosterQueryHandler

- **File**: `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` (MODIFY)
- **Changes**:
  1. Extract FormatVersion to class-level constant: `private const int FormatVersion = 2;`
  2. Replace L121 `FormatVersion = 1,` → `FormatVersion = FormatVersion,`
  3. Add fields: `_keyWrap` (IStoreKeyWrapService), `_dataKeys` (IStoreDataKeyProvider)
  4. Add 2 ctor params (after `IOfflineVerifierService offlineVerifierService`)
  5. Load DEK once after storeUsers fetch: `byte[] dek = _dataKeys.GetDek(query.StoreId);`
  6. Wrap per user inside foreach (after `CreateVerifier`): `var wrap = _keyWrap.WrapDek(su.User.Password, dek);`
  7. Add wrap fields to OfflineRosterUserDto initializer
- **⚠️ M2**: Do NOT rename `_offlineVerifierService`
- **Depends**: Task 6 + Task 7
- **Verify**: `dotnet build backend/src/Application/Application.csproj`

### Task 9 — Update handler unit tests

- **File**: `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` (MODIFY)
- **Changes**:
  1. `TestMocks` class: add `DataKeyProvider` + `KeyWrapService` (Mock<IStoreDataKeyProvider>, Mock<IStoreKeyWrapService>)
  2. `CreateMocks()`: add both new mocks
  3. `CreateHandler()`: add 2 params at end of ctor call
  4. **ALL 4 tests** need new mock params in `CreateHandler` call (even auth-throw tests)
  5. Success test (L108): `dto.FormatVersion.Should().Be(1)` → `.Be(2)`
  6. Add DEK + wrap mock setups in success tests
  7. Add assertions: wrap fields populated, `.OnlyContain(u => u.WrappedDek == ...)`
  8. Add verifications: `GetDek(_storeId)` called Once, `WrapDek` per user
  9. ⚠️ **M3**: Use `_storeId` not `query.StoreId`
  10. ⚠️ **M6**: Add params to ALL CreateHandler calls
- **Depends**: Task 8
- **Verify**: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"`

---

## Phase 3: E2E Tests

### Task 10 — Update E2E TestDtos

- **File**: `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` (MODIFY)
- **Add to `RosterUserData`** (after `Verifier`):
  ```csharp
  public string WrappedDek { get; set; } = string.Empty;
  public string WrapSalt { get; set; } = string.Empty;
  public string WrapIv { get; set; } = string.Empty;
  ```
- **Depends**: Task 7 (mirrors production DTO)
- **Verify**: `dotnet build backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`

### Task 11 — Update E2E tests

- **File**: `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` (MODIFY)
- **Changes**:
  1. `SuperAdmin_export_roster_returns_full_bundle`: L43 `.Be(1)` → `.Be(2)` + add wrap field assertions
  2. Add new test: `Export_twice_yields_the_same_dek_after_unwrap`
     - Seed store with 1 user (known password)
     - Export twice → unwrap both DEKs using PBKDF2 + AES-GCM byte-for-byte
     - Assert DEKs are identical
     - Helper: `UnwrapDek(storedHash, wrappedDek, salt, iv)` with `wrapped[..^16]` ciphertext + `wrapped[^16..]` tag
  3. ⚠️ **M1**: Use `Users/ExportOfflineRosterTests.cs` path
- **⚠️ Precondition**: Ensure `StoreEncryption:MasterSecret` is available in the E2E test host (`appsettings.Tests.json` may need it if fixture doesn't inherit base)
- **Depends**: Task 8 + Task 10
- **Verify**: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"`

---

## Phase 4: Full Suite

### Task 12 — Run full test suite

- **Command**: `dotnet test backend/src/SMCA.sln`
- **Expected**: All tests pass (no regressions)
- **Depends**: Tasks 1–11

---

## Dependency Graph

```
Task 1 ──► Task 2 ──► Task 3
Task 4 ──► Task 5
Task 1 ──┐
         ├──► Task 6 ──► Task 8 ──► Task 9 ──► Task 12
Task 4 ──┘               │                       ▲
                         ├──► Task 11 ───────────┘
Task 7 ──────────────────┤
                         └──► Task 10 ──► Task 11
```

## Execution Order

1. Tasks 1 + 4 (parallel, no deps)
2. Tasks 2 + 5 (parallel, dep: Task 1, Task 4)
3. Task 3 (dep: Task 2)
4. Task 6 (dep: Task 1 + Task 4)
5. Task 7 (no deps)
6. Task 8 (dep: Task 6 + Task 7)
7. Tasks 9 + 10 (parallel, dep: Task 8, Task 7)
8. Task 11 (dep: Task 8 + Task 10)
9. Task 12 (dep: Task 9 + Task 11)

## NO COMMITS

Do NOT add git commit steps in any task. Implementation only.
