# At-Rest Encryption — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the offline roster export so the backend wraps a per-store Data Encryption Key (DEK) under each user's password-derived key and returns it in a `formatVersion: 2` bundle, enabling the PWA to encrypt local business data at rest.

**Architecture:** A stateless `StoreDataKeyProvider` derives a stable 32-byte DEK per store via `HKDF-SHA256(serverMasterSecret, info=storeId)` (no DB state). A pure `StoreKeyWrapService` wraps that DEK per user with `AES-GCM` under a `PBKDF2` key derived from the user's already-stored password hash (`User.Password`). The existing `ExportOfflineRosterQueryHandler` loads the DEK once, wraps it per user, and attaches `wrappedDek`/`wrapSalt`/`wrapIv` to each `OfflineRosterUserDto`, bumping the bundle `FormatVersion` to 2. The backend never sees a plaintext password.

**Tech Stack:** .NET 8, MediatR, EF Core, built-in System.Security.Cryptography (AesGcm, Rfc2898DeriveBytes, HKDF, RandomNumberGenerator) — no new NuGet.

## Global Constraints

- **Depends on the offline-auth backend being implemented first** (`docs/plans/2026-07-25-offline-auth-backend-plan.md`). This plan MODIFIES files that plan creates: `OfflineRosterUserDto`, `OfflineRosterDto`, `ExportOfflineRosterQueryHandler`, its handler test, `SMCA.WebApi.E2ETests/.../ExportOfflineRosterTests.cs`, and `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`. Do NOT start until those exist.
- **Strict TDD:** every task is failing test → run (FAIL) → minimal impl → run (PASS) → commit.
- **Per-user wrap fields** added to `OfflineRosterUserDto`: `string WrappedDek`, `string WrapSalt`, `string WrapIv` (all Base64). Default camelCase serialization → `wrappedDek`, `wrapSalt`, `wrapIv`.
- **Bundle version:** bump `OfflineRosterDto.FormatVersion` from `1` to `2` (the handler's `FormatVersion` constant).
- **Wrap service:** `IStoreKeyWrapService` + `StoreKeyWrapService`, method `WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek)`; `sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv)`.
- **KEK derivation (MUST match the frontend byte-for-byte):** `kek = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(storedPasswordHash), wrapSalt, 210_000, HashAlgorithmName.SHA256, 32)`. `storedPasswordHash` is `User.Password` = `Base64(SHA256(utf8(password)))` (`SMCA.WebApi/Services/HashPasswordService.cs:11-20`).
- **Randomness / AEAD:** `wrapSalt = RandomNumberGenerator.GetBytes(16)`; `wrapIv = RandomNumberGenerator.GetBytes(12)`; AES-GCM with a 16-byte tag (`new AesGcm(kek, 16)` — the tag-size ctor arg is REQUIRED on net8; the parameterless overload is obsolete `SYSLIB0053`).
- **Ciphertext layout:** `WrappedDek = Base64(ciphertext ‖ tag)` — the 16-byte GCM tag is APPENDED to the ciphertext. The DEK is 32 bytes, so `wrapped.Length == 48` and the frontend splits: `tag = wrapped[^16..]`, `ciphertext = wrapped[..^16]`.
- **DEK:** 32 bytes, stable across every export for a given store (device ciphertext must stay readable).
- **Do not add JSON config:** JSON stays default camelCase; no naming policy.
- **Handler contract:** every handler returns `ResponseResult<T>`; controllers only `Ok(await Sender.Send(...))`; DTOs are `sealed class` with settable props; services registered `AddScoped` in `Program.cs` near `IHashPasswordService` (`Program.cs:57`).

## DEK storage decision

**Decision A — DERIVED DEK (no DB migration).** `DEK = HKDF.DeriveKey(SHA256, ikm=UTF8(serverMasterSecret), outputLength=32, salt=null, info=UTF8(storeId.ToString("D")))`. The codebase already has a first-class server-secret config mechanism — `Jwt:SecretKey` is read via `builder.Configuration.GetValue<string>("Jwt:SecretKey")` (`SMCA.WebApi/Extensions/ServiceExtensions.cs:24`) and bound to `JwtOptions` (`SMCA.WebApi/OptionsSetup/JwtOptionsSetup.cs`), so a new `StoreEncryption:MasterSecret` key follows an established pattern. HKDF is a net8 built-in (`System.Security.Cryptography.HKDF`), the derivation is deterministic (DEK is stable per store by construction — no rotation, no stored column, no EF migration), and it keeps the backend stateless. Decision B (stored Base64 column on `Store` + migration) was rejected: it adds mutable state and a migration for zero benefit given the master-secret path exists.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` | Create | `IStoreKeyWrapService` contract + `WrappedDekResult` record. |
| `Application/Services/Authentication/StoreKeyWrapService.cs` | Create | PBKDF2 KEK + AES-GCM wrap of a DEK. Pure/stateless. |
| `Application/Abstractions/Authentication/IStoreDataKeyProvider.cs` | Create | `IStoreDataKeyProvider` contract (`byte[] GetDek(Guid storeId)`). |
| `Application/Services/Authentication/StoreDataKeyProvider.cs` | Create | HKDF-SHA256 derivation of the per-store DEK from the master secret. |
| `SMCA.WebApi/appsettings.json` | Modify | Add `StoreEncryption:MasterSecret` config section. |
| `SMCA.WebApi/Program.cs` | Modify | Register `IStoreKeyWrapService` + `IStoreDataKeyProvider` (AddScoped, near line 57). |
| `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | Modify | Add `WrappedDek`, `WrapSalt`, `WrapIv` string props. |
| `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | Modify | Inject provider + wrap service; load DEK once; wrap per user; bump `FormatVersion` to 2. |
| `Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs` | Create | Round-trip + distinct-salt/iv unit tests. |
| `Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs` | Create | Determinism/stability + per-store + known-answer HKDF tests. |
| `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` | Modify | Assert `FormatVersion==2` + per-user wrap fields; verify DEK loaded once and `WrapDek` called per user. |
| `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | Modify | Add `WrappedDek`/`WrapSalt`/`WrapIv` to the roster-user test DTO. |
| `SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs` | Modify | Assert `formatVersion==2` + fields non-empty; add export-twice DEK-stability unwrap round-trip. |

---

### Task 1: StoreKeyWrapService (PBKDF2 KEK + AES-GCM wrap) + DI

**Files:**
- Create: `Application/Abstractions/Authentication/IStoreKeyWrapService.cs`
- Create: `Application/Services/Authentication/StoreKeyWrapService.cs`
- Modify: `SMCA.WebApi/Program.cs` (line 57 area)
- Test: `Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs`

**Interfaces:**
- Produces: `IStoreKeyWrapService.WrapDek(string storedPasswordHash, byte[] dek) -> WrappedDekResult` where `WrappedDekResult` is `sealed record (string WrappedDek, string WrapSalt, string WrapIv)`.

- [ ] **Step 1: Write the failing test**

`Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs`:

```csharp
using Application.Services.Authentication;
using FluentAssertions;
using System;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class StoreKeyWrapServiceTests
{
    private const int Iterations = 210_000;
    // Base64(SHA256(utf8("test"))) — the shape of a real User.Password value.
    private const string StoredHash = "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=";

    [Fact]
    public void WrapDek_output_unwraps_back_to_the_same_dek()
    {
        var sut = new StoreKeyWrapService();
        byte[] dek = RandomNumberGenerator.GetBytes(32);

        var result = sut.WrapDek(StoredHash, dek);

        byte[] salt = Convert.FromBase64String(result.WrapSalt);
        byte[] iv = Convert.FromBase64String(result.WrapIv);
        byte[] wrapped = Convert.FromBase64String(result.WrappedDek);

        salt.Length.Should().Be(16);
        iv.Length.Should().Be(12);
        wrapped.Length.Should().Be(dek.Length + 16); // ciphertext ‖ 16-byte tag

        // Reconstruct the KEK exactly as the frontend will, then AES-GCM decrypt.
        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(StoredHash), salt, Iterations, HashAlgorithmName.SHA256, 32);

        byte[] ciphertext = wrapped[..^16];
        byte[] tag = wrapped[^16..];
        byte[] recovered = new byte[ciphertext.Length];
        using var aes = new AesGcm(kek, 16);
        aes.Decrypt(iv, ciphertext, tag, recovered);

        recovered.Should().Equal(dek);
    }

    [Fact]
    public void WrapDek_uses_a_fresh_salt_and_iv_each_call()
    {
        var sut = new StoreKeyWrapService();
        byte[] dek = RandomNumberGenerator.GetBytes(32);

        var a = sut.WrapDek(StoredHash, dek);
        var b = sut.WrapDek(StoredHash, dek);

        a.WrapSalt.Should().NotBe(b.WrapSalt);
        a.WrapIv.Should().NotBe(b.WrapIv);
        a.WrappedDek.Should().NotBe(b.WrappedDek);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreKeyWrapServiceTests"`
Expected: FAIL — `StoreKeyWrapService` does not exist (compile error).

- [ ] **Step 3: Write the interface and implementation**

`Application/Abstractions/Authentication/IStoreKeyWrapService.cs`:

```csharp
namespace Application.Abstractions.Authentication
{
    public sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv);

    public interface IStoreKeyWrapService
    {
        WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek);
    }
}
```

`Application/Services/Authentication/StoreKeyWrapService.cs`:

```csharp
using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication
{
    public sealed class StoreKeyWrapService : IStoreKeyWrapService
    {
        private const int Iterations = 210_000;
        private const int SaltBytes = 16;
        private const int IvBytes = 12;
        private const int KekBytes = 32;
        private const int TagBytes = 16;

        public WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek)
        {
            byte[] salt = RandomNumberGenerator.GetBytes(SaltBytes);
            byte[] iv = RandomNumberGenerator.GetBytes(IvBytes);

            byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(storedPasswordHash),
                salt,
                Iterations,
                HashAlgorithmName.SHA256,
                KekBytes);

            byte[] ciphertext = new byte[dek.Length];
            byte[] tag = new byte[TagBytes];
            using (var aes = new AesGcm(kek, TagBytes))
            {
                aes.Encrypt(iv, dek, ciphertext, tag);
            }

            // Layout: ciphertext ‖ tag (tag last 16 bytes) — the frontend splits on this.
            byte[] wrapped = new byte[ciphertext.Length + tag.Length];
            Buffer.BlockCopy(ciphertext, 0, wrapped, 0, ciphertext.Length);
            Buffer.BlockCopy(tag, 0, wrapped, ciphertext.Length, tag.Length);

            return new WrappedDekResult(
                Convert.ToBase64String(wrapped),
                Convert.ToBase64String(salt),
                Convert.ToBase64String(iv));
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreKeyWrapServiceTests"`
Expected: PASS (2 tests).

- [ ] **Step 5: Register in DI**

In `SMCA.WebApi/Program.cs`, right after `builder.Services.AddScoped<IHashPasswordService, HashPasswordService>();` (line 57), add:

```csharp
builder.Services.AddScoped<IStoreKeyWrapService, StoreKeyWrapService>();
```

Ensure `using Application.Abstractions.Authentication;` (already present at line 11) and add `using Application.Services.Authentication;` if not present.

- [ ] **Step 6: Commit**

```bash
git add Application/Abstractions/Authentication/IStoreKeyWrapService.cs \
        Application/Services/Authentication/StoreKeyWrapService.cs \
        Application.Tests/Services/Authentication/StoreKeyWrapServiceTests.cs \
        SMCA.WebApi/Program.cs
git commit -m "feat(backend): add per-user store DEK wrap service"
```

---

### Task 2: StoreDataKeyProvider (HKDF-derived per-store DEK) + config + DI

**Files:**
- Create: `Application/Abstractions/Authentication/IStoreDataKeyProvider.cs`
- Create: `Application/Services/Authentication/StoreDataKeyProvider.cs`
- Modify: `SMCA.WebApi/appsettings.json`
- Modify: `SMCA.WebApi/Program.cs`
- Test: `Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs`

**Interfaces:**
- Produces: `IStoreDataKeyProvider.GetDek(Guid storeId) -> byte[]` (32 bytes, deterministic per store).

- [ ] **Step 1: Write the failing test**

`Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs`:

```csharp
using Application.Services.Authentication;
using FluentAssertions;
using System;
using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace Application.Tests.Services.Authentication;

public class StoreDataKeyProviderTests
{
    private const string MasterSecret = "test-master-secret-0123456789ABCDEF";

    [Fact]
    public void GetDek_is_deterministic_for_the_same_store()
    {
        var sut = new StoreDataKeyProvider(MasterSecret);
        var storeId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        byte[] first = sut.GetDek(storeId);
        byte[] second = sut.GetDek(storeId);

        first.Length.Should().Be(32);
        first.Should().Equal(second); // stable across exports — device ciphertext stays readable
    }

    [Fact]
    public void GetDek_differs_per_store()
    {
        var sut = new StoreDataKeyProvider(MasterSecret);
        var a = sut.GetDek(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var b = sut.GetDek(Guid.Parse("22222222-2222-2222-2222-222222222222"));
        a.Should().NotEqual(b);
    }

    [Fact]
    public void GetDek_matches_independent_hkdf_computation()
    {
        var sut = new StoreDataKeyProvider(MasterSecret);
        var storeId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        byte[] expected = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            Encoding.UTF8.GetBytes(MasterSecret),
            32,
            salt: null,
            info: Encoding.UTF8.GetBytes(storeId.ToString("D")));

        sut.GetDek(storeId).Should().Equal(expected);
    }

    [Fact]
    public void Ctor_throws_when_master_secret_missing()
    {
        Action act = () => new StoreDataKeyProvider("");
        act.Should().Throw<ArgumentException>();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreDataKeyProviderTests"`
Expected: FAIL — `StoreDataKeyProvider` does not exist (compile error).

- [ ] **Step 3: Write the interface and implementation**

`Application/Abstractions/Authentication/IStoreDataKeyProvider.cs`:

```csharp
namespace Application.Abstractions.Authentication
{
    public interface IStoreDataKeyProvider
    {
        byte[] GetDek(Guid storeId);
    }
}
```

`Application/Services/Authentication/StoreDataKeyProvider.cs`:

```csharp
using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication
{
    public sealed class StoreDataKeyProvider : IStoreDataKeyProvider
    {
        private const int DekBytes = 32;
        private readonly byte[] _masterSecret;

        public StoreDataKeyProvider(string masterSecret)
        {
            if (string.IsNullOrWhiteSpace(masterSecret))
                throw new ArgumentException(
                    "Store encryption master secret is not configured (StoreEncryption:MasterSecret).",
                    nameof(masterSecret));

            _masterSecret = Encoding.UTF8.GetBytes(masterSecret);
        }

        public byte[] GetDek(Guid storeId)
        {
            return HKDF.DeriveKey(
                HashAlgorithmName.SHA256,
                _masterSecret,
                DekBytes,
                salt: null,
                info: Encoding.UTF8.GetBytes(storeId.ToString("D")));
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~StoreDataKeyProviderTests"`
Expected: PASS (4 tests).

- [ ] **Step 5: Add config + register in DI**

In `SMCA.WebApi/appsettings.json`, add a top-level section (a placeholder GUID — production MUST override via environment/secret store with a high-entropy value, exactly like `Jwt:SecretKey`):

```json
  "StoreEncryption": {
    "MasterSecret": "0D5D3E5F-3E7C-4C1A-9E2B-6F1E9C4A7B20"
  }
```

In `SMCA.WebApi/Program.cs`, right after the `IStoreKeyWrapService` registration from Task 1, add a factory registration that reads the secret from config:

```csharp
builder.Services.AddScoped<IStoreDataKeyProvider>(_ =>
    new StoreDataKeyProvider(builder.Configuration.GetValue<string>("StoreEncryption:MasterSecret")!));
```

- [ ] **Step 6: Commit**

```bash
git add Application/Abstractions/Authentication/IStoreDataKeyProvider.cs \
        Application/Services/Authentication/StoreDataKeyProvider.cs \
        Application.Tests/Services/Authentication/StoreDataKeyProviderTests.cs \
        SMCA.WebApi/appsettings.json \
        SMCA.WebApi/Program.cs
git commit -m "feat(backend): derive stable per-store DEK via HKDF"
```

---

### Task 3: Extend OfflineRosterUserDto with the wrap fields

**Files:**
- Modify: `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs`

**Interfaces:**
- Produces: `OfflineRosterUserDto` gains `string WrappedDek`, `string WrapSalt`, `string WrapIv` (settable, default `string.Empty`) → camelCase `wrappedDek`, `wrapSalt`, `wrapIv`.

> This DTO is a pure data holder; it has no standalone unit test. Its new fields are exercised by the failing handler test written in Task 4 (which will not compile until these props exist), so Task 3 MUST land before Task 4.

- [ ] **Step 1: Add the three properties**

In `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs`, immediately after the existing `Verifier` property, add:

```csharp
    public string WrappedDek { get; set; } = string.Empty;
    public string WrapSalt { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
```

The DTO now reads (context — the offline-auth plan created everything above `WrappedDek`):

```csharp
using Application.Dtos.Authentication; // reuse StoreModuleFeaturesDto
namespace Application.Dtos.Management.StoreUsers;
public sealed class OfflineRosterUserDto
{
    public Guid Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public ICollection<StoreModuleFeaturesDto> Roles { get; set; } = new List<StoreModuleFeaturesDto>();
    public List<int> FeatureIds { get; set; } = new();
    public List<int> StoreModuleIds { get; set; } = new();
    public bool IsSuperAdmin { get; set; }
    public bool IsOwnerAdmin { get; set; }
    public bool IsReSeller { get; set; }
    public Guid SelectedStoreId { get; set; }
    public OfflineVerifierDto Verifier { get; set; } = new();
    public string WrappedDek { get; set; } = string.Empty;
    public string WrapSalt { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Commit**

```bash
git add Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs
git commit -m "feat(backend): add wrapped-DEK fields to offline roster user dto"
```

---

### Task 4: Wire DEK load + per-user wrap into the export handler (bump FormatVersion to 2)

**Files:**
- Modify: `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`
- Test: `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs`

**Interfaces:**
- Consumes: `IStoreDataKeyProvider.GetDek(Guid)` (Task 2), `IStoreKeyWrapService.WrapDek(string, byte[])` (Task 1), plus all existing handler collaborators.
- Produces: an `OfflineRosterDto` with `FormatVersion == 2` and every `OfflineRosterUserDto` carrying `WrappedDek`/`WrapSalt`/`WrapIv`.

- [ ] **Step 1: Extend the handler test (write the failing assertions)**

In the existing `ExportOfflineRosterQueryHandlerTests.cs`, add the two new mocks to the SuperAdmin/success setup and assert the new behavior. Concretely, in the success test (the offline-auth "SuperAdmin, store with 2 users" case):

```csharp
// --- new collaborators (add to the mock setup) ---
var dek = System.Security.Cryptography.RandomNumberGenerator.GetBytes(32);
var dataKeys = new Mock<IStoreDataKeyProvider>();
dataKeys.Setup(p => p.GetDek(It.IsAny<Guid>())).Returns(dek);

var wrapped = new WrappedDekResult("d3JhcHBlZERlaw==", "c2FsdA==", "aXY=");
var keyWrap = new Mock<IStoreKeyWrapService>();
keyWrap.Setup(w => w.WrapDek(It.IsAny<string>(), It.IsAny<byte[]>())).Returns(wrapped);

// Pass dataKeys.Object and keyWrap.Object into the handler ctor (new params, see Step 2).

// --- new assertions on the successful result ---
result.Data.FormatVersion.Should().Be(2);
result.Data.Users.Should().OnlyContain(u =>
    u.WrappedDek == "d3JhcHBlZERlaw==" &&
    u.WrapSalt == "c2FsdA==" &&
    u.WrapIv == "aXY=");

// DEK is loaded exactly once for the whole export (not per user).
dataKeys.Verify(p => p.GetDek(query.StoreId), Times.Once);

// Each user's DEK is wrapped under that user's stored password hash + the loaded DEK.
foreach (var su in storeUsers) // the same seed the mock repo returns
    keyWrap.Verify(w => w.WrapDek(su.User.Password, dek), Times.Once);
```

> Keep the offline-auth cases (a: non-admin throws `ApiException`; b: OwnerAdmin of a non-owned store throws; d: `CreateVerifier` called per user) unchanged — only add the two mocks to the handler ctor call in each case so it still compiles, and add the assertions above to the success case.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"`
Expected: FAIL — handler ctor has no `IStoreDataKeyProvider`/`IStoreKeyWrapService` params and does not populate the wrap fields / `FormatVersion` is still 1.

- [ ] **Step 3: Wire the handler**

In `ExportOfflineRosterQuery.cs`, make these edits:

1. Bump the version constant:

```csharp
private const int FormatVersion = 2;
```

2. Add two fields + two ctor params (place them next to `_verifier`):

```csharp
        private readonly IStoreKeyWrapService _keyWrap;
        private readonly IStoreDataKeyProvider _dataKeys;
```

```csharp
        public ExportOfflineRosterQueryHandler(
            IHttpContextService http,
            IStoreUserRepository storeUsers,
            IStoreRepository stores,
            IStoreModuleRepository storeModules,
            IStoreRoleFeatureRepository storeRoleFeatures,
            IUserRoleRepository userRoles,
            IAllowedFeaturesService allowedFeatures,
            IOfflineVerifierService verifier,
            IStoreKeyWrapService keyWrap,
            IStoreDataKeyProvider dataKeys,
            IStringLocalizer<I18n> localizer)
        {
            _http = http;
            _storeUsers = storeUsers;
            _stores = stores;
            _storeModules = storeModules;
            _storeRoleFeatures = storeRoleFeatures;
            _userRoles = userRoles;
            _allowedFeatures = allowedFeatures;
            _verifier = verifier;
            _keyWrap = keyWrap;
            _dataKeys = dataKeys;
            _localizer = localizer;
        }
```

3. Load the DEK once, before the user loop (after `storeUsers` is fetched):

```csharp
            byte[] dek = _dataKeys.GetDek(query.StoreId);
```

4. Inside the `foreach`, after `var v = _verifier.CreateVerifier(user.Password);`, wrap the DEK and attach the fields to the `new OfflineRosterUserDto { ... }` initializer:

```csharp
                var wrap = _keyWrap.WrapDek(user.Password, dek);
```

```csharp
                    Verifier = new OfflineVerifierDto { Hash = v.Hash, Salt = v.Salt, Iterations = v.Iterations },
                    WrappedDek = wrap.WrappedDek,
                    WrapSalt = wrap.WrapSalt,
                    WrapIv = wrap.WrapIv,
```

Add `using Application.Abstractions.Authentication;` if not already imported (it is required for `IOfflineVerifierService`, so it is already present).

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~ExportOfflineRosterQueryHandlerTests"`
Expected: PASS (all offline-auth cases + the new wrap assertions).

- [ ] **Step 5: Commit**

```bash
git add Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs \
        Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs
git commit -m "feat(backend): wrap per-store DEK per user in roster export (formatVersion 2)"
```

---

### Task 5: E2E — endpoint returns formatVersion 2 with wrap fields + DEK stability round-trip

**Files:**
- Modify: `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`
- Modify: `SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs`

**Interfaces:**
- Consumes: `GET /api/v1/storeusers/{storeId}/offline-roster` (created by the offline-auth plan).
- Produces: E2E assertions that the live endpoint returns `formatVersion == 2`, non-empty `wrappedDek`/`wrapSalt`/`wrapIv` per user, and a stable DEK across two exports.

> Precondition: the E2E host must have `StoreEncryption:MasterSecret` configured. It is present in `appsettings.json` (Task 2) which `WebAppFixture` loads; if the fixture overrides configuration, add the same key to the fixture's in-memory/test config so `StoreDataKeyProvider` resolves.

- [ ] **Step 1: Extend the roster test DTO (write the failing assertions)**

In `SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs`, add the three fields to the per-user roster test DTO the offline-auth plan created (it deserializes camelCase `wrappedDek`/`wrapSalt`/`wrapIv`):

```csharp
    public string WrappedDek { get; set; } = string.Empty;
    public string WrapSalt { get; set; } = string.Empty;
    public string WrapIv { get; set; } = string.Empty;
```

In `ExportOfflineRosterTests.cs`, update the offline-auth success case (`SuperAdmin -> 200`) so `formatVersion` is now `2`, and assert the fields are populated:

```csharp
data.FormatVersion.Should().Be(2);
data.Users.Should().OnlyContain(u =>
    !string.IsNullOrEmpty(u.WrappedDek) &&
    !string.IsNullOrEmpty(u.WrapSalt) &&
    !string.IsNullOrEmpty(u.WrapIv));
```

Then add a new stability test that exports twice and proves both wrapped copies unwrap to the SAME DEK (the strongest end-to-end guarantee of the pinned contract — it exercises the real PBKDF2 + AES-GCM path byte-for-byte):

```csharp
[Fact]
public async Task Export_twice_yields_the_same_dek_after_unwrap()
{
    // Seed a store with one user whose plaintext password is known to the test.
    const string password = "P@ssw0rd-e2e";
    // ... seed store + user via StoreSeed/AuthzSeed with this password (mirror the
    // existing success-case seeding), mint the SuperAdmin JWT, capture storeId + userId.

    try
    {
        var first  = await GetRosterAsync(storeId);   // helper: GET + deserialize ApiResponse<RosterData>
        var second = await GetRosterAsync(storeId);

        var u1 = first.Users.Single(u => u.Id == userId);
        var u2 = second.Users.Single(u => u.Id == userId);

        // storedPasswordHash == Base64(SHA256(utf8(password))) — same as User.Password on the server.
        string storedHash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(password)));

        byte[] dek1 = UnwrapDek(storedHash, u1.WrappedDek, u1.WrapSalt, u1.WrapIv);
        byte[] dek2 = UnwrapDek(storedHash, u2.WrappedDek, u2.WrapSalt, u2.WrapIv);

        dek1.Length.Should().Be(32);
        dek1.Should().Equal(dek2); // DEK stable across exports
    }
    finally
    {
        // ... cleanup, mirroring the offline-auth test's try/finally teardown.
    }
}

private static byte[] UnwrapDek(string storedHash, string wrappedDekB64, string saltB64, string ivB64)
{
    byte[] salt = Convert.FromBase64String(saltB64);
    byte[] iv = Convert.FromBase64String(ivB64);
    byte[] wrapped = Convert.FromBase64String(wrappedDekB64);

    byte[] kek = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(
        System.Text.Encoding.UTF8.GetBytes(storedHash), salt, 210_000,
        System.Security.Cryptography.HashAlgorithmName.SHA256, 32);

    byte[] ciphertext = wrapped[..^16];
    byte[] tag = wrapped[^16..];
    byte[] dek = new byte[ciphertext.Length];
    using var aes = new System.Security.Cryptography.AesGcm(kek, 16);
    aes.Decrypt(iv, ciphertext, tag, dek);
    return dek;
}
```

> `GetRosterAsync` and the seeding/JWT/cleanup helpers already exist in the offline-auth `ExportOfflineRosterTests.cs`; reuse them. If a raw GET helper is not factored out there, inline the same GET + `ApiResponse<RosterData>` deserialization the offline-auth success case uses.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"`
Expected: FAIL — the success case expected `formatVersion == 1` before this change / the new round-trip test cannot compile until the DTO fields exist and the handler emits them.

- [ ] **Step 3: (No new production code)**

All production behavior was implemented in Tasks 1–4. This task only strengthens E2E coverage. If Step 2 fails for any reason other than the intended assertions (e.g. `StoreDataKeyProvider` throwing because the secret is unconfigured in the test host), add `StoreEncryption:MasterSecret` to the fixture config per the Step 1 precondition.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ExportOfflineRosterTests"`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `dotnet test backend/src/SMCA.sln`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs \
        SMCA.WebApi.E2ETests/Management/ExportOfflineRosterTests.cs
git commit -m "test(backend): assert formatVersion 2 wrap fields and stable DEK across exports"
```

---

## Self-Review

- **Spec coverage:** wrap service `WrapDek` with exact PBKDF2/AES-GCM params (T1); per-store DEK source — Decision A HKDF + config secret, stable by construction (T2); `OfflineRosterUserDto` gains the three wrap fields (T3); handler loads DEK once + wraps per user + bumps `FormatVersion` to 2 (T4); endpoint E2E asserts `formatVersion==2`, non-empty fields, and DEK stability across two exports (T5). Design §8 backend bullets — "distinct salts/ivs per call" (T1 Step 1 test 2), "DEK stable across two exports" (T2 determinism + T5 round-trip), "roster export returns formatVersion 2 with the three wrap fields populated per user" (T4 + T5) — all covered.
- **Placeholder scan:** no `TBD`/`add error handling`/`...` in production code. The only prose ellipses are in the T5 E2E body, which explicitly defers to the offline-auth test's existing seed/JWT/cleanup helpers (real, named) rather than re-transcribing them — intentional, not a gap.
- **Type consistency:** `WrappedDekResult(WrappedDek, WrapSalt, WrapIv)` (T1) → `OfflineRosterUserDto.WrappedDek/WrapSalt/WrapIv` strings (T3) → handler assigns them (T4) → E2E DTO mirrors them (T5). `IStoreDataKeyProvider.GetDek(Guid) -> byte[32]` (T2) consumed once in T4; `IStoreKeyWrapService.WrapDek(string, byte[])` (T1) consumed per user in T4. KEK params (PBKDF2-SHA256 / 210000 / 32) identical in T1 impl, T1 test, and T5 unwrap helper. Tag layout `ciphertext ‖ tag[16]` identical in T1 impl (`Buffer.BlockCopy`), T1 test split, and T5 unwrap split. Aligned.
- **net8 gotchas flagged:** `new AesGcm(key, 16)` (tag-size ctor required; parameterless is obsolete); `HKDF.DeriveKey` static; `Rfc2898DeriveBytes.Pbkdf2` static — all built-in, no NuGet.
- **Dependency honesty:** Tasks 3/4/5 modify offline-auth-created files; the plan states this precondition up front and shows the surrounding context (DTO, handler ctor, E2E DTO) so the editor matches the real, post-offline-auth code rather than guessing.
