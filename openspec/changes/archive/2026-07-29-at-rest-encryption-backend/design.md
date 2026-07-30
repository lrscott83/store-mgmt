# Design: At-Rest Encryption Backend

## Technical Approach

Stateless key-wrapping layer on the existing `ExportOfflineRosterQueryHandler`. A `StoreDataKeyProvider` derives a deterministic 32-byte DEK per store via HKDF-SHA256 from a configurable master secret. A `StoreKeyWrapService` wraps that DEK per user via PBKDF2 KEK + AES-GCM. The handler loads the DEK once per export, wraps it for each user, and attaches `WrappedDek`/`WrapSalt`/`WrapIv` to the DTO, bumping `FormatVersion` to 2. All crypto is `System.Security.Cryptography` — no new NuGet.

## Architecture Decisions

### Decision: Derived DEK over stored DEK

| Option | Tradeoff | Decision |
|--------|----------|----------|
| A: HKDF-derived DEK | No DB migration, stateless, stable per store | **Chosen** |
| B: Stored Base64 column on `Store` | EF migration, mutable state, zero benefit over derived | Rejected |

**Rationale**: The codebase already uses `Jwt:SecretKey` config pattern (`ServiceExtensions.cs:24`). Adding `StoreEncryption:MasterSecret` follows the same established mechanism. No DB changes required.

### Decision: DI registration style

| Option | Tradeoff | Decision |
|--------|----------|----------|
| A: `AddScoped` inline in Program.cs (line 60) | Matches existing `IHashPasswordService` + `IOfflineVerifierService` pattern | **Chosen** |
| B: Via `AddApplication()` in a service extensions | Would need new DI module, inconsistent with adjacent registrations | Rejected |

**Rationale**: `Program.cs` lines 58-59 register services inline. New services at line 60 are consistent. `StoreDataKeyProvider` uses a factory delegate (needs `builder.Configuration`).

### Decision: Record in interface file

| Option | Tradeoff | Decision |
|--------|----------|----------|
| A: `sealed record WrappedDekResult` in same file as interface | Follows `IOfflineVerifierService`+`OfflineVerifierResult` pattern | **Chosen** |
| B: Separate file | Unnecessary indirection for a single-record contract | Rejected |

**Rationale**: `IOfflineVerifierService.cs` co-locates `OfflineVerifierResult record` (9 lines total). Mirror this.

## Data Flow

```
ExportOfflineRosterQuery
        │
        ▼
ExportOfflineRosterQueryHandler.Handle()
        │
        ├─ 1. Auth checks (unchanged)
        ├─ 2. Load store data (unchanged)
        ├─ 3. byte[] dek = _dataKeys.GetDek(query.StoreId)    ← ONCE
        │
        ├─ 4. foreach (var su in storeUsers)
        │       ├─ ... (existing role/feature/verifier logic)
        │       ├─ var wrap = _keyWrap.WrapDek(su.User.Password, dek)
        │       └─ attach WrappedDek, WrapSalt, WrapIv to DTO
        │
        └─ 5. OfflineRosterDto { FormatVersion = 2, ... }
```

### Wrap internals (per user)

```
su.User.Password ─┐
                  ├─► PBKDF2(210k, SHA256) ──► KEK (32 bytes)
wrapSalt (16 RNG) ┘                              │
                                                  ▼
            DEK (32 bytes) ───────────────► AES-GCM-128 ──► ciphertext(32) ‖ tag(16)
            wrapIv (12 RNG) ───────────────┘                        │
                                                                  Base64 → WrappedDek
```

### DEK derivation (per store, once)

```
StoreEncryption:MasterSecret ──► UTF8 bytes ─┐
                                              ├─► HKDF.DeriveKey(SHA256, ikm, 32, null, info)
storeId.ToString("D") ────────► UTF8 bytes ──┘        │
                                                       ▼
                                               DEK (32 bytes, stable)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` | Create | Interface + `WrappedDekResult` record (mirrors `IOfflineVerifierService` pattern) |
| `Application/Services/Authentication/StoreKeyWrapService.cs` | Create | PBKDF2 KEK + AES-GCM wrap, pure/stateless |
| `Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` | Create | Interface: `byte[] GetDek(Guid storeId)` |
| `Application/Services/Authentication/StoreDataKeyProvider.cs` | Create | HKDF-SHA256 derivation from configured master secret |
| `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | Modify | Add `WrappedDek`, `WrapSalt`, `WrapIv` (string, default `""`) |
| `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Modify | Add 2 ctor params + fields, load DEK once, wrap per user, `FormatVersion = 2` |
| `SMCA.WebApi/Program.cs` | Modify | Register both services at line 60 (after L58-59) |
| `SMCA.WebApi/appsettings.json` | Modify | Add `StoreEncryption: { "MasterSecret": "..." }` |
| `Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs` | Create | Round-trip + distinct params (2 tests) |
| `Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` | Create | Determinism + per-store + known-answer + missing-secret (4 tests) |
| `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` | Modify | Add 2 mocks to all 4 tests, assert FormatVersion=2 + wrap fields + DEK loaded once + WrapDek called per user |
| `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | Add `WrappedDek`/`WrapSalt`/`WrapIv` to `RosterUserData` |
| `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Modify | Assert FormatVersion=2 + fields non-empty; add DEK-stability round-trip test |

**Total**: 4 new files, 7 modified files, 0 deleted.

## Interfaces / Contracts

```csharp
// IStoreKeyWrapService.cs
namespace Application.Abstractions.Authentication;
public sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv);
public interface IStoreKeyWrapService
{
    WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek);
}

// IStoreDataKeyProvider.cs
namespace Application.Abstractions.Authentication;
public interface IStoreDataKeyProvider
{
    byte[] GetDek(Guid storeId);
}

// DI registration (Program.cs, line 60)
builder.Services.AddScoped<IStoreKeyWrapService, StoreKeyWrapService>();
builder.Services.AddScoped<IStoreDataKeyProvider>(_ =>
    new StoreDataKeyProvider(builder.Configuration.GetValue<string>("StoreEncryption:MasterSecret")!));
```

## Cryptographic Design

| Algorithm | Parameters | Output | Usage |
|-----------|------------|--------|-------|
| HKDF-SHA256 | `HKDF.DeriveKey(SHA256, ikm=UTF8(masterSecret), 32, null, info=UTF8(storeId.ToString("D")))` | 32-byte DEK | Per-store, stable |
| PBKDF2-SHA256 | `Rfc2898DeriveBytes.Pbkdf2(UTF8(storedPasswordHash), salt, 210000, SHA256, 32)` | 32-byte KEK | Per user wrap |
| AES-GCM-128 | `new AesGcm(kek, 16)`, 12-byte IV, `Encrypt(iv, dek, ciphertext, tag)` | 32+16 bytes | Wrap DEK |
| Tag layout | `wrapped = ciphertext ‖ tag` (tag = last 16 bytes) | 48 bytes | Frontend splits `wrapped[..^16]` / `wrapped[^16..]` |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `StoreKeyWrapService` | Round-trip: wrap → reconstruct KEK → AES-GCM decrypt → same DEK. Distinct params: same input → different salt/iv/wrapped per call. |
| Unit | `StoreDataKeyProvider` | Determinism: same storeId → same DEK. Per-store: different storeId → different DEK. Known-answer: matches independent `HKDF.DeriveKey`. Missing secret: throws `ArgumentException`. |
| Unit | `ExportOfflineRosterQueryHandler` | 2 new mocks in all 4 tests (2 auth fail + 2 success). Success cases assert FormatVersion=2, wrap fields populated, `GetDek` called once, `WrapDek` called per user. |
| E2E | `ExportOfflineRosterTests` | FormatVersion=2 + non-empty wrap fields. New round-trip: export twice → unwrap both → DEKs identical. |

## Critical Mismatches (vs Reference Plan)

The reference plan at `docs/plans/2026-07-25-at-rest-encryption-backend-plan.md` contains 7 verified inaccuracies. **Apply phase MUST use these corrections:**

| # | Plan says | Actual code | Action |
|---|-----------|-------------|--------|
| M1 | `Management/ExportOfflineRosterTests.cs` | `Users/ExportOfflineRosterTests.cs` | Correct path |
| M2 | `_verifier` field | `_offlineVerifierService` field (L28) | Use actual field name |
| M3 | `query.StoreId` in test setups | `_storeId` class-level field (L24) | Use `_storeId` |
| M4 | FormatVersion = 1 is a var | Literal `1` on `OfflineRosterDto` init (L121) | Change to `FormatVersion = 2` |
| M5 | DI at "line 57" | L58: `AddScoped<IHashPasswordService>`, L59: `AddScoped<IOfflineVerifierService>` | New services at **line 60** |
| M6 | Only success test needs mocks | All 4 tests call `CreateHandler` → all need 2 new mock params | Add to `CreateMocks` + `CreateHandler` |
| M7 | Assert `.Be(1)` | Handler L108: `.Be(1)`, E2E L43: `.Be(1)` | Change to `.Be(2)` |

## Migration / Rollout

No migration required. DEK is derived, not stored. Rollback: revert FormatVersion, remove 3 DTO fields, remove 2 DI registrations, delete 4 new files + 2 test files, revert handler mocks and E2E assertions.

## Open Questions

None. All crypto parameters are pinned between backend and frontend specs.
