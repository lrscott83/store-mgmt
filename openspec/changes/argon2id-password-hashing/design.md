# Design: Argon2id password hashing

> Scope of this document: the HOW at architectural level. Every claim is anchored to `file:line` actually read.
> Anything I could not verify from the repo is marked **⚠️ NOT VERIFIED** — the implementer must confirm it
> against the installed package before writing the line. Nothing here was inferred from memory of a NuGet API.

> **SUPERSEDED (2026-08-05, decision `sdd/argon2id-password-hashing/decisions`, observation #1909):**
> ADR-2 and ADR-4 below (the `IValidateOptions<AuthenticationSettings>` validator + `ValidateOnStart()`
> fail-fast mechanism, and moving the pepper into user-secrets) were reverted. The pepper stays in
> `appsettings.json` exactly where it is today, wired as Argon2's `Secret`. There is no startup
> validation, no `IValidateOptions` type, and no docker-compose change. Production configuration
> leaves git via a new gitignored `appsettings.Production.json`, not by gitignoring the base file.
> Each affected section below carries an inline correction; read those over the original prose where
> they conflict.

## 1. Constraints that shape the architecture

| # | Constraint | Evidence |
|---|---|---|
| C1 | `IHashPasswordService` signature is frozen: `HashPassword(string)`, `VerifyPassword(string,string)` | `Application/Abstractions/Authentication/IHashPasswordService.cs:5-6` |
| C2 | `DbTestHelpers.HashPassword(string)` is `static`, has **no DI scope**, and its signature is frozen (~35 call sites in unauthorized E2E files) | `SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs:21-22`; call sites e.g. `:29,:42,:113`, `Infrastructure/AuthTestHelpers.cs:42`, `Users/ExportOfflineRosterTests.cs:615,632,692` |
| C3 | **Eager reads of `builder.Configuration` inside the `Program.cs` body do NOT see `appsettings.Tests.json`.** The E2E factory adds that file via `ConfigureAppConfiguration`, which is applied *after* the Program body runs | `SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs:17-20` (comment documenting exactly this trap, with the `ConnectionStrings__Application` env-var workaround at `:21-22`); `Infrastructure/AppTestFactory.cs:19-25` |
| C4 | Lazy `IOptions<T>` binding **does** see `appsettings.Tests.json` — proven today by `Iterations: 6` overriding `appsettings.json:83`'s `3` | `SMCA.WebApi.E2ETests/appsettings.Tests.json:5-7` vs `SMCA.WebApi/appsettings.json:83`; explore.md:10 |
| C5 | E2E runs under environment `Testing`, so **user-secrets are not loaded** there (`CreateBuilder` adds them only in Development) | `AppTestFactory.cs:17`; `SMCA.WebApi/Program.cs:25` |
| C6 | There is **no** `appsettings.Testing.json`; the app under test loads `appsettings.json` + the explicitly-added `appsettings.Tests.json` only | glob of `SMCA.WebApi/appsettings*.json` → only `appsettings.json`, `appsettings.Development.json` |
| C7 | `Application` is a plain `Microsoft.NET.Sdk` class library — no ASP.NET shared framework, no `Microsoft.Extensions.Hosting` | `Application/Application.csproj:1-22` |
| C8 | No `Directory.Build.props` / central package management; every `.csproj` pins its own versions; TFM `net8.0` everywhere | explore.md:52; `Application.csproj:4`, `SMCA.WebApi.csproj:4`, `SMCA.WebApi.E2ETests.csproj:4` |

C3 is the single most load-bearing constraint in this design. It rules out the obvious fail-fast implementation.

---

## 2. Architecture overview

Three consumers, **one** hashing implementation, **one** settings type, **three** configuration compositions.

```
                        Application (class library)
                        ├── Abstractions/Authentication/
                        │   ├── IHashPasswordService.cs        (UNCHANGED)
                        │   └── AuthenticationSettings.cs      (reshaped)
                        └── Services/Authentication/
                            ├── Argon2idHashPasswordService.cs (NEW — sole implementation)
                            └── AuthenticationSettingsValidator.cs (NEW — sole rule set)
                                        ▲            ▲            ▲
             ┌──────────────────────────┘            │            └──────────────────────┐
             │                                       │                                   │
   SMCA.WebApi (host)                    SMCA.WebApi.E2ETests                  SMCA.PasswordHasher
   DI: AddApplication()                  DbTestHelpers static field            manual composition
   config: appsettings.json              config: appsettings.Tests.json        config: appsettings.json
         + appsettings.{Env}.json               (test-only literals)                 (linked, same file)
         + env vars                                                                   + env vars
   no startup validation                 no startup validation                 no startup validation
```

> **SUPERSEDED**: the `fail-fast` row above (`ValidateOnStart()` / ctor-throws) and the
> `user-secrets` sources are gone per the banner note. Pepper flows through the same
> `appsettings.json` (+ gitignored `appsettings.Production.json` in prod) every consumer already reads.

**The layering rule**: `Application` owns *what is valid* and *how to hash*. Each host owns *where configuration
comes from* and *when validation fires*. No host owns an algorithm constant.

---

## 3. Decisions (ADR style)

### ADR-1 — One implementation class, injected settings, no static algorithm helper

**Decision.** `Application/Services/Authentication/Argon2idHashPasswordService.cs`, namespace
`Application.Services.Authentication` (mirrors `BcryptHashPasswordService.cs:4`), sealed, constructor
`Argon2idHashPasswordService(IOptions<AuthenticationSettings> settings)` — identical shape to the class it
replaces (`BcryptHashPasswordService.cs:10-13`). Registered at `Application/DependencyInjection.cs:62`
(`AddScoped`, unchanged lifetime).

**Rationale.** C1 means the 5 call sites (explore.md:24-28) change by zero lines. Keeping the ctor shape means
`DbTestHelpers` and the console tool can construct it with `Options.Create(settings)` without a container.

**Rejected.** A `static Argon2Hasher.Hash(password, settings)` helper that both the service and `DbTestHelpers`
call. Rejected because it invites a *second* settings source — the exact failure mode that produced the
overloaded-`Iterations` bug. One class, one settings object, three compositions.

---

### ADR-2 — SUPERSEDED: no `IValidateOptions` type, no construction-time validation

> **This ADR is reverted in full** (decision #1909). `AuthenticationSettingsValidator` is
> NOT built. `Argon2idHashPasswordService`'s constructor does not validate — it reads
> `IOptions<AuthenticationSettings>.Value` and uses the fields as-is. An out-of-range
> value (e.g. a negative memory cost) surfaces as whatever exception the Isopoh library
> itself throws when `Argon2.Hash()` is called, not as a pre-flight check. The floors
> table below (`Argon2MemoryKib >= 8192`, etc.) is descriptive guidance for the values
> actually configured, not an enforced rule. Original text preserved below for historical
> context only — do not implement it.

### ADR-2 (original, not implemented) — Validation rules live in one type, invoked from two places

**Decision.** New `Application/Services/Authentication/AuthenticationSettingsValidator.cs`:

```
public sealed class AuthenticationSettingsValidator : IValidateOptions<AuthenticationSettings>
{
    public static IReadOnlyList<string> Collect(AuthenticationSettings s);   // pure; returns failure messages
    public ValidateOptionsResult Validate(string? name, AuthenticationSettings options);
}
```

`Collect` is the single rule set. It is called from:
1. `Argon2idHashPasswordService`'s **constructor** — throws `OptionsValidationException(name, typeof(AuthenticationSettings), failures)` if non-empty. Makes an unvalidated instance unconstructible, in *any* host.
2. The `IValidateOptions<>` implementation — feeds the host's startup validation (ADR-4).

Both paths throw the same exception type with the same messages.

**Placement rationale.** It lives under `Services/`, not `Abstractions/`, because it is an implementation of a
policy. `Abstractions/Authentication/` keeps the POCO (`AuthenticationSettings.cs`) and the interface
(`IHashPasswordService.cs`) only. `IValidateOptions<>` and `OptionsValidationException` come from
`Microsoft.Extensions.Options`, already reachable — `BcryptHashPasswordService.cs:2` already uses
`Microsoft.Extensions.Options`, pulled by `Application.csproj:12`.

**Rules** (each failure message names the *configuration key*, not the C# property):

| Key | Rule | Why this floor |
|---|---|---|
| `Authentication:Pepper` | not null, not whitespace | the whole point of fail-fast |
| `Authentication:Argon2MemoryKib` | `>= 8192` **and** `>= 8 * Argon2Parallelism` | 8 MiB floor keeps the test env able to reproduce a prod failure (proposal:51); `m >= 8p` is the Argon2 spec minimum |
| `Authentication:Argon2TimeCost` | `>= 2` | prod 3 / test 2 — one notch apart, same shape |
| `Authentication:Argon2Parallelism` | `1..16` | Isopoh `Lanes` |
| `Authentication:Argon2SaltBytes` | `>= 16` | RFC 9106 recommendation |
| `Authentication:Argon2HashBytes` | `>= 32` | 256-bit output |

**Rejected.** Validating only `Pepper` and letting Argon2 itself reject bad cost parameters. Rejected because
that is precisely today's failure mode: `BCrypt.Net` rejected `workFactor: 3` (`BcryptHashPasswordService.cs:17`)
at **first hash**, in **one environment**, and the test environment had patched the value away
(`appsettings.Tests.json:6`). The floors turn "wrong magnitude" into a startup error everywhere.

---

### ADR-3 — Settings reshape: five explicitly-named fields, `Iterations` deleted

**Decision.** `Application/Abstractions/Authentication/AuthenticationSettings.cs`:

- **remove** `Iterations` (`:7`)
- **add** `Argon2MemoryKib`, `Argon2TimeCost`, `Argon2Parallelism`, `Argon2SaltBytes`, `Argon2HashBytes` (all `int`)
- keep `Pepper` (`:6`), `JwtSecretKey`, `Issuer`, `Audience`, `TokenLifetimeDays`, `RefreshTokenExpirationDays` (`:8-12`)

**Defaults in the POCO**: `0` for every Argon2 field, **not** the production values. A missing key must fail
validation, not silently succeed with a plausible default. `Pepper` keeps `= string.Empty` (`:6`).

**Compile-break inventory** (removing `Iterations` breaks these — all unit tests, allowed to change):

| Site | Action |
|---|---|
| `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs:30` | file is deleted wholesale (proposal:24) |
| `Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs:39` | **delete that one line** — ⚠️ *this site is not in the proposal*; found by grepping `new AuthenticationSettings` |
| `Application.Tests/Authentication/Commands/Login/LoginCommandHandlerTests.cs:38-42` | no `Iterations` — untouched |

Grep for `_settings.Iterations` outside the service returns nothing. Every other `Iterations` in the repo is an
unrelated PBKDF2 constant (`OfflineVerifierService.cs:9`, `StoreKeyWrapService.cs:9`, `IOfflineVerifierService.cs:3`,
`IStoreKeyWrapService.cs:3`, the roster DTOs) — **do not touch**.

---

### ADR-4 — SUPERSEDED: no fail-fast, no `Program.cs` change

> **This ADR is reverted in full** (decision #1909). There is no `ValidateOnStart()` call,
> no `IValidateOptions` registration, and `Program.cs` is not touched by this change.
> `DependencyInjection.cs:60-62` changes only insofar as ADR-3's new field names replace
> `Iterations` and the implementation swaps to `Argon2idHashPasswordService` — no validator
> line is added. C3 (documented below) remains true as a fact about this codebase, but it no
> longer motivates anything: there is nothing left that needs "the merged configuration view
> at host-start time" because nothing validates at startup. Original text preserved below for
> historical context only — do not implement it.

### ADR-4 (original, not implemented) — Fail-fast: `ValidateOnStart()` in `Program.cs`, validator registration in `AddApplication`

This is the decision C3 forces.

**Decision.**

`Application/DependencyInjection.cs`, replacing `:60-62`:

```
services.Configure<AuthenticationSettings>(configuration.GetSection(AuthenticationSettings.SectionName));
services.AddSingleton<IValidateOptions<AuthenticationSettings>, AuthenticationSettingsValidator>();
services.AddScoped<IHashPasswordService, Argon2idHashPasswordService>();
```

`SMCA.WebApi/Program.cs`, immediately after the `AddApplication(...).AddInfrastructure(...)` chain at `:56-58`:

```
builder.Services.AddOptions<AuthenticationSettings>().ValidateOnStart();
```

**Why the split.** `ValidateOnStart()` is an extension over `OptionsBuilder<T>` shipped in the
`Microsoft.Extensions.Hosting` assembly (⚠️ **NOT VERIFIED** — confirm the assembly; if `Application` turns out to
need it, add `<PackageReference Include="Microsoft.Extensions.Hosting" Version="8.0.0" />` and move the line into
`AddApplication`). `SMCA.WebApi` is `Microsoft.NET.Sdk.Web` (`SMCA.WebApi.csproj:1`) so it has it from the shared
framework at zero cost; `Application` is a plain library (C7). Application owns *what* is valid; the host owns
*when* it is checked.

**Why not an eager read inside `AddApplication`.** `configuration.GetSection(...).Get<AuthenticationSettings>()`
called at registration time runs inside the `Program.cs` body → per **C3** it would see `appsettings.json` only.
Once `Pepper` is deleted from `appsettings.json`, that check would throw during E2E host construction even though
`appsettings.Tests.json` supplies a valid pepper — **it would take the entire E2E suite down**. `ValidateOnStart()`
runs at host start, after configuration is fully composed, so it sees the merged view (same mechanism that makes
C4 true today).

**How each consumer satisfies fail-fast:**

| Consumer | Mechanism | Fires when |
|---|---|---|
| API (`dotnet run`, docker) | `ValidateOnStart()` | host start, before the first request |
| E2E test host | same `Program.cs` line — the factory runs the full Program body up to `app.Run()` (`Program.cs:172`); the host starts on first `Factory.Services` access (`WebAppFixture.cs:26`) | fixture init, naming the missing key |
| `DbTestHelpers` static hasher | `Argon2idHashPasswordService` **constructor** (ADR-2 path 1) | first `HashPassword` call in the suite |
| `SMCA.PasswordHasher` | same constructor — no generic host, so `IStartupValidator` never runs; the ctor is the only guard and it is sufficient | at composition, before any argument is hashed |

**Rejected.** An eager `app.Services.CreateScope().GetRequiredService<IHashPasswordService>()` after
`builder.Build()` (`Program.cs:121`). It works and needs no package, but it is a hand-rolled startup probe that
the next reader will not recognise as validation. Keep it as the documented fallback if `ValidateOnStart()` turns
out to be unavailable.

---

### ADR-5 — `DbTestHelpers` reads the same file the app-under-test reads, and a new E2E test pins the agreement

This is the answer to the static-helper problem (C2).

**Decision.** `DbTestHelpers` gets a private static, lazily-initialised `IHashPasswordService` built from
`appsettings.Tests.json` in `AppContext.BaseDirectory`, and `HashPassword` becomes a one-line delegation.
Signature unchanged.

```
private static readonly IHashPasswordService Hasher = CreateHasher();

private static IHashPasswordService CreateHasher()
{
    var config = new ConfigurationBuilder()
        .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.Tests.json"), optional: false)
        .AddEnvironmentVariables()
        .Build();

    var settings = new AuthenticationSettings();
    config.GetSection(AuthenticationSettings.SectionName).Bind(settings);
    return new Argon2idHashPasswordService(Options.Create(settings));
}

public static string HashPassword(string password) => Hasher.HashPassword(password);   // signature FROZEN
```

**Why this specific path is correct, not merely plausible.** `AppTestFactory.cs:21-24` adds
`Path.Combine(AppContext.BaseDirectory, "appsettings.Tests.json")` as the **last** configuration source for the
app under test, so it wins over `appsettings.json`. The helper reads **the identical file at the identical path**.
`SMCA.WebApi.E2ETests.csproj:33-37` already copies it to the output directory (`PreserveNewest`). `AddJsonFile` is
already in use in this project (`AppTestFactory.cs:5,21`), so no new package reference is needed; `Bind` and
`Options.Create` come from the same shared framework the project already resolves through its
`SMCA.WebApi` project reference (`SMCA.WebApi.E2ETests.csproj:27`) — ⚠️ **NOT VERIFIED** at compile time; if either
is missing add `Microsoft.Extensions.Configuration.Binder` / `Microsoft.Extensions.Options` 8.0.0.

**The completeness precondition.** `appsettings.Tests.json` must declare **every** `Authentication` key the
validator checks, including `Pepper`. The helper reads that file *alone* — it does not merge `appsettings.json`.
If a key is absent, the helper's settings would diverge from the app's merged view. Two guards make that
impossible to ship silently:
1. The ctor validator (ADR-2) throws on the first seed call, naming the missing key.
2. The drift test below.

**The concrete anti-drift mechanism — a NEW E2E test** (adding new E2E tests is explicitly allowed):
`SMCA.WebApi.E2ETests/Infrastructure/PasswordHashParityTests.cs`, in the `"e2e"` collection
(`WebAppFixture.cs:38-39`), asserting:

1. `appService.VerifyPassword("Password123", DbTestHelpers.HashPassword("Password123"))` is `true`
   — the app accepts what the helper produces.
2. `helperService.VerifyPassword("Password123", appService.HashPassword("Password123"))` is `true`
   — the reverse direction, catching a pepper mismatch that direction 1 alone could mask.
3. Field-by-field equality between `fixture.Factory.Services.GetRequiredService<IOptions<AuthenticationSettings>>().Value`
   and the settings the helper bound, for the six hashing keys.

Assertion 3 is the actual drift detector: it fails the moment `appsettings.json` gains an `Authentication` key
that `appsettings.Tests.json` does not mirror, or vice versa. Assertions 1-2 would still pass in some of those
cases, which is why 3 exists.

**Rejected.**
- *Overload `HashPassword(AppTestFactory, string)`* — would require editing unauthorized E2E test bodies. Violates C2 and the project rule.
- *A `[ModuleInitializer]` or `IAsyncLifetime` that pushes the factory into a static field* — creates an ordering dependency between fixture construction and seed calls, and `Infrastructure/*Seed.cs` helpers are called from tests that may run before it. Fragile.
- *Hard-coding the test parameters as constants in `DbTestHelpers`* — a second source of truth. This is the mock-that-lies pattern `CLAUDE.md` documents; rejecting it is the entire point of the authorization.

**Verified non-issue.** `ExportOfflineRosterTests.cs:262,541` wrap the DEK with the user's stored password hash.
They read it **from the database** (`:256-259`, `:534-537`, `.Select(u => u.Password)`), not by recomputing
`DbTestHelpers.HashPassword`. Argon2's random salt therefore does not break them. `:577` deliberately passes the
plaintext and expects failure — still fails. **No change needed to that file.**

---

### ADR-6 — Isopoh full-control form, explicit salt, PHC string as the storage format

**Decision.** Use the `Argon2Config` full-control form, never the convenience `Argon2.Hash(password)` overload,
so every parameter is the bound configuration value and nothing is a library default.

**Salt.** 16 (`Argon2SaltBytes`) bytes from `System.Security.Cryptography.RandomNumberGenerator.GetBytes(int)` —
BCL, already the pattern used in this codebase at `Application/Services/Authentication/OfflineVerifierService.cs:15`.
Generated **per hash call**, never reused, never stored separately: it is emitted into the PHC string by the
encoder, and recovered from the PHC string by the decoder on verify. There is no salt column and no schema change.

**Parameter mapping:**

| `AuthenticationSettings` | `Argon2Config` member | Note |
|---|---|---|
| `Argon2MemoryKib` | `MemoryCost` | ⚠️ **NOT VERIFIED**: confirm the unit is KiB. The convenience overload's `65536` default is consistent with KiB (= 64 MiB), but a wrong assumption here is a 1024× memory error. Confirm before writing. |
| `Argon2TimeCost` | `TimeCost` | |
| `Argon2Parallelism` | `Lanes` **and** `Threads` | `Lanes` is part of the Argon2 digest; `Threads` is a scheduling knob only. Setting both equal keeps them from ever disagreeing. |
| `Argon2HashBytes` | `HashLength` | |
| `Pepper` | `Secret` = `Encoding.UTF8.GetBytes(pepper)` | the pepper's designed home |
| (per-call) | `Password` = `Encoding.UTF8.GetBytes(password)`, `Salt` = 16 random bytes | |
| — | `Type` = Argon2**id**, `Version` = 19 | ⚠️ **NOT VERIFIED** enum member names (`Argon2Type.HybridAddressing`, `Argon2Version.Nineteen`) |
| — | `AssociatedData` | left unset — no per-hash context data |

**API verification status.** Only the member *list* is verified, and only from the package README as quoted in
`explore.md:54`: `Argon2Config { Type, Version, TimeCost, MemoryCost, Lanes, Threads, Password, Salt, Secret,
AssociatedData, HashLength }`, `new Argon2(config).Hash()`, `Argon2.Hash(password)`, `Argon2.Verify(passwordHash, password)`.
There is no NuGet cache on this machine (`~/.nuget/packages` does not exist) and I am not permitted to run
`dotnet`, so **nothing below beyond that list is verified**:

| Member | Status |
|---|---|
| `Argon2Config.EncodeString(byte[])` → PHC string | ⚠️ NOT VERIFIED |
| `Argon2Config.DecodeString(string, out SecureArray<byte>)` → `bool` | ⚠️ NOT VERIFIED |
| `SecureArray<byte>` as the return of `Argon2.Hash()` | ⚠️ NOT VERIFIED |
| `Argon2.FixedTimeEquals(...)` | ⚠️ NOT VERIFIED |
| An `Argon2.Verify` overload accepting a `secret` | ⚠️ NOT VERIFIED — **critical**: the two-argument `Argon2.Verify(hash, password)` from the README quote does **not** take a secret. If no secret-aware overload exists, the decode-and-recompute shape below is mandatory, not optional. |

**Intended `HashPassword` shape** (implementer confirms member names first):

```
var salt = RandomNumberGenerator.GetBytes(_settings.Argon2SaltBytes);
var config = new Argon2Config {
    Type = <Argon2id>, Version = <19>,
    TimeCost = _settings.Argon2TimeCost,
    MemoryCost = _settings.Argon2MemoryKib,
    Lanes = _settings.Argon2Parallelism, Threads = _settings.Argon2Parallelism,
    HashLength = _settings.Argon2HashBytes,
    Password = Encoding.UTF8.GetBytes(password),
    Salt = salt,
    Secret = Encoding.UTF8.GetBytes(_settings.Pepper),
};
using var argon2 = new Argon2(config);
using var hash = argon2.Hash();
return config.EncodeString(hash.Buffer);          // "$argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>"
```

**Intended `VerifyPassword` shape** — decode-then-recompute, which is what gives us three properties for free:

```
if (string.IsNullOrWhiteSpace(storedHash)) return false;
var config = new Argon2Config {
    Password = Encoding.UTF8.GetBytes(password),
    Secret   = Encoding.UTF8.GetBytes(_settings.Pepper),
    Threads  = _settings.Argon2Parallelism,
};
SecureArray<byte>? expected = null;
try {
    if (!config.DecodeString(storedHash, out expected) || expected is null) return false;  // malformed → false
    using var argon2 = new Argon2(config);
    using var computed = argon2.Hash();
    return Argon2.FixedTimeEquals(expected, computed);
}
catch { return false; }                            // never throws — see below
finally { expected?.Dispose(); }
```

1. **Cost parameters come from the stored string**, not from configuration. Raising `Argon2MemoryKib` later does
   not invalidate a single existing hash. This is the property that makes the whole migration schema-free.
2. **Malformed input returns `false`** (`DecodeString` returns `false`) — required by proposal:26 for
   `AuthLoginFailureTests.cs` / `AuthLoginValidationTests.cs`.
3. The blanket `catch` is the belt-and-braces for input shapes `DecodeString` might reject by throwing rather than
   returning `false`. **Requirement: `VerifyPassword` must not throw for any `storedHash` value, including `null`,
   `""`, a bcrypt string, or a raw base64 SHA256 string.** Unit tests must cover each of those four inputs.

**Rejected.** `Konscious.Security.Cryptography.Argon2` (explore.md:55) — returns raw bytes, so the codebase would
hand-roll PHC encoding. Homegrown crypto-format code is exactly what produced the bug being fixed. Also rejected:
a `NeedsUpgrade`-style format-dispatch branch. Every hash the system produces starts with `$argon2id$`; a
dispatcher on `StartsWith('$')` (`BcryptHashPasswordService.cs:23`, `:42-45`, `AuthenticationService.cs:51`) would
be permanently dead.

---

### ADR-7 — Package placement: Isopoh in `Application` only

**Decision.** `Application/Application.csproj`: remove line `11`
(`<PackageReference Include="BCrypt.Net-Next" Version="4.2.0" />`), add
`<PackageReference Include="Isopoh.Cryptography.Argon2" Version="2.0.0" />`.

**Every other project gets it transitively** — no second reference anywhere:

| Project | Reaches `Application` via |
|---|---|
| `SMCA.WebApi` | `SMCA.WebApi.csproj:41` |
| `SMCA.WebApi.E2ETests` | `SMCA.WebApi.E2ETests.csproj:29` |
| `Application.Tests` | `Application.Tests.csproj:28` |
| `SMCA.PasswordHasher` | new `ProjectReference` (ADR-8) |

**`BCrypt.Net-Next` removal is safe — verified, not assumed.** Grepping `BCrypt` across `backend/` returns only:
`Application.csproj:11` (the reference), `BcryptHashPasswordService.cs:17,24` (deleted with the file), and
comments / test-method names / a literal string `"$2a$11$bcrypt_stored_hash"` at
`AuthenticationServiceTests.cs:565` (deleted with the upgrade tests) plus comments at
`AuthenticationService.cs:50,53` and `AuthenticationServiceTests.cs:76`. **No other production or test code
references the `BCrypt.Net` namespace.**

---

### ADR-8 — `SMCA.PasswordHasher`: linked `appsettings.json`, no user-secrets, no DI container

> **Correction (decision #1909)**: the `UserSecretsId` property and `AddUserSecrets<Program>()`
> call below are dropped — the pepper lives in `appsettings.json` (+ a gitignored
> `appsettings.Production.json` when `ASPNETCORE_ENVIRONMENT=Production`), so the tool reads
> the same linked file the API does and needs no secret store of its own.

There is no `Exe` project in the repo to copy from (explore.md:60). This establishes the pattern.

**Project.** `backend/src/SMCA.PasswordHasher/SMCA.PasswordHasher.csproj`, `Microsoft.NET.Sdk`:

```xml
<PropertyGroup>
  <OutputType>Exe</OutputType>
  <TargetFramework>net8.0</TargetFramework>
  <ImplicitUsings>enable</ImplicitUsings>
  <Nullable>enable</Nullable>
</PropertyGroup>
```

**Packages** (`Application` transitively supplies `Microsoft.Extensions.Options.ConfigurationExtensions` via
`Application.csproj:12`, but **not** the configuration *providers*):

```xml
<PackageReference Include="Microsoft.Extensions.Configuration.Json" Version="8.0.0" />
<PackageReference Include="Microsoft.Extensions.Configuration.EnvironmentVariables" Version="8.0.0" />
<PackageReference Include="Microsoft.Extensions.Configuration.Binder" Version="8.0.0" />
```

⚠️ **NOT VERIFIED**: whether `Binder` arrives transitively through `Options.ConfigurationExtensions`. Listing it
explicitly is harmless and removes the question.

**Project reference**: `..\Application\Application.csproj` **only**. Not `SMCA.WebApi` — that would drag the whole
web stack into a one-shot CLI.

**How it gets `appsettings.json` without duplicating it** — link the API's file into the tool's output, the
pattern already used at `Application.Tests.csproj:33-37`:

```xml
<ItemGroup>
  <None Include="..\SMCA.WebApi\appsettings.json" Link="appsettings.json" CopyToOutputDirectory="PreserveNewest" />
</ItemGroup>
```

One file on disk, two consumers. No runtime path-walking up the directory tree, no copy to drift.

**Composition** (`Program.cs`, no `IHost`, no `ServiceCollection`):

```
var config = new ConfigurationBuilder()
    .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: false)
    .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.Production.json"), optional: true)
    .AddEnvironmentVariables()
    .Build();

var settings = new AuthenticationSettings();
config.GetSection(AuthenticationSettings.SectionName).Bind(settings);

IHashPasswordService hasher = new Argon2idHashPasswordService(Options.Create(settings));  // no ctor validation (ADR-2 superseded)
```

Source order: JSON (committed) → `appsettings.Production.json` (gitignored, optional — present only on the
VPS) → environment. This mirrors `WebApplication.CreateBuilder`'s own default composition for a
`Production`-environment host, minus user-secrets (dropped per ADR-8's correction note above).

**Arguments.**
- exactly one argument → the plaintext password.
- zero arguments, or a whitespace-only argument → usage to **stderr**, exit code `1`.
- more than one argument → error to stderr, exit code `1`. (Do **not** silently hash `args[0]`: an unquoted
  password containing a space would produce a hash for a truncated password. That is a silent-wrong-answer bug.)
- no `--verify` mode in this change. Out of scope; note it as a follow-up.

**Output contract** — diagnostics to stderr, hash alone on stdout, so the tool is pipeable:

```
stderr:  argon2id  m=65536 KiB  t=3  p=2  salt=16B  hash=32B   pepper: present (source: appsettings.json)
stdout:  $argon2id$v=19$m=65536,t=3,p=2$<salt>$<hash>
```

"pepper: present/absent" satisfies proposal:31 (a mismatch is visible, not silent). Printing the pepper *source*
requires probing the providers; if that proves awkward, print presence only — do **not** print the pepper value.

**Invocation the user types** (from the repo root — no user-secrets step; the pepper is
already in `appsettings.json`):

```bash
dotnet run --project backend/src/SMCA.PasswordHasher -- "Password123"
```

**Solution registration** — the command for the user to run (I am not permitted to run it):

```bash
dotnet sln backend/src/SMCA.sln add backend/src/SMCA.PasswordHasher/SMCA.PasswordHasher.csproj --solution-folder src
```

If that fails, edit `SMCA.sln` by hand: a `Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}")` block (the C#
project type GUID used at `SMCA.sln:10-28`), four `ProjectConfigurationPlatforms` lines matching the pattern at
`SMCA.sln:36-39`, and a `NestedProjects` entry mapping the new GUID to `{79921FC4-A55E-468D-82F6-DC731768EE0C}`
(the `src` folder, `SMCA.sln:6`, pattern at `SMCA.sln:81`).

**Rejected.** Building a full `Host`/`ServiceCollection` in the tool. `AddApplication` (`DependencyInjection.cs:27-65`)
registers MediatR, AutoMapper, FluentValidation, billing, tenants, stores — an enormous graph for one hash. Direct
construction reuses the *service and the settings type*, which is what "no duplicated configuration" actually
means. The cost is that `IStartupValidator` never runs — covered by the ctor validation (ADR-4).

---

## 4. Configuration matrix (post-change)

> **Correction (decision #1909)**: `Pepper` is NOT deleted from `appsettings.json` or
> `appsettings.Development.json` — it stays exactly where it is today (`appsettings.json:82`,
> `appsettings.Development.json:76`), same value as now. No key moves to user-secrets. A new
> `appsettings.Production.json` (gitignored, not present in this repo) is where the VPS may
> override any of these keys in production; it is not created or populated by this change.

| Key | `appsettings.json` | `appsettings.Development.json` | `appsettings.Tests.json` | `appsettings.Production.json` (gitignored, VPS-only) |
|---|---|---|---|---|
| `Authentication:Pepper` | **unchanged** (`:82`) | **unchanged** (`:76`) | test-only literal, explicit | optional override, not created by this change |
| `Authentication:Iterations` | **deleted** (`:83`) | **deleted** (`:77`) | **deleted** (`:6`) | — |
| `Authentication:Argon2MemoryKib` | `65536` | inherit | `16384` | — |
| `Authentication:Argon2TimeCost` | `3` | inherit | `2` | — |
| `Authentication:Argon2Parallelism` | `2` | inherit | `1` | — |
| `Authentication:Argon2SaltBytes` | `16` | inherit | `16` | — |
| `Authentication:Argon2HashBytes` | `32` | inherit | `32` | — |

`appsettings.Tests.json` must list **all six** keys explicitly, including `Pepper` — per ADR-5 the static helper
reads that file alone and does not merge `appsettings.json`. "inherit" in the Development column means the key is
simply absent there; the Development file today re-states the whole `Authentication` block (`:75-83`), and
trimming it to the keys that actually differ is optional cleanup, not required by this change.

Test costs differ from production only in **magnitude**, never in **shape**. There is no enforced floor (ADR-2 is
superseded — no validator); the values above are chosen to keep the test environment representative without being
slow, by discipline rather than by code.

---

## 5. Data flow

**Register / create user** — `CreateOwnerService.cs:21`, `CreateStoreUserCommand.cs:42`,
`CreateReSellerCommand.cs:44`, `UpdateUserPasswordCommand.cs:34` (explore.md:24-28)
→ `IHashPasswordService.HashPassword(plaintext)`
→ fresh 16-byte salt + pepper as `Secret`
→ PHC string persisted to `User.Password`. No schema change.

**Login** — `AuthenticationService.IsValidUserAsync` (`:44`) → `VerifyPassword(plaintext, user.Password)`
→ decode PHC → recompute with the *stored* parameters + the *configured* pepper → constant-time compare.
**The block at `AuthenticationService.cs:50-56` is deleted**; `:56` is followed directly by the reseller check at `:58`.

**E2E seed** — `DbTestHelpers.HashPassword` → the same `Argon2idHashPasswordService` instance, configured from
`appsettings.Tests.json`, the same file the app under test reads last. The seeded hash and the app's verifier now
share one algorithm, one pepper, one parameter set — this is the coverage *increase* noted in decision #1909.

**Console tool** — plaintext argv → same service, configured from the API's `appsettings.json` (+ an optional
gitignored `appsettings.Production.json`, present only on the VPS) → PHC string on stdout, pasteable into
`User.Password`, accepted by `POST /auth/login`.

---

## 6. Integration points and blast radius

| Touch point | Change | Risk |
|---|---|---|
| `IHashPasswordService` (`IHashPasswordService.cs:5-6`) | none | zero — the 5 call sites are untouched |
| `DependencyInjection.cs:60-62` | implementation swap only (no validator registration — ADR-4 superseded) | contained |
| `Program.cs` | **none** (ADR-4 superseded) | zero |
| `AuthenticationService.cs:50-56` | deleted block | the two unit tests at `AuthenticationServiceTests.cs:514-589` go with it |
| `DbTestHelpers.cs:21-22` | authorized body change; **signature frozen** | ~35 call sites compile unchanged |
| `User.Password` column | none | PHC strings are `varchar`-compatible; ⚠️ **NOT VERIFIED**: confirm the column length in `UserEntityTypeConfiguration` accommodates ~95-100 chars |
| Offline roster DEK wrap (`StoreKeyWrapService.cs:23`, `OfflineVerifierService.cs:16`) | none in code | **any DEK wrapped against an old-format hash becomes unwrappable.** Acceptable only under the no-production-data premise. E2E is safe (ADR-5, verified non-issue). |

**Deletion inventory** (complete, each verified):

| File / range | Note |
|---|---|
| `Application/Services/Authentication/BcryptHashPasswordService.cs` | whole file (66 lines) |
| `Application/Services/Authentication/…` `LegacyHash()` `:47-65`, legacy branches `:26-29`, `:31-35`, `NeedsUpgrade()` `:42-45` | subsumed by the file deletion |
| `Application/Services/Authentication/AuthenticationService.cs:50-56` | legacy upgrade branch |
| `SMCA.WebApi/Services/HashPasswordService.cs` | unregistered dead file (explore.md:18) |
| `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs` | whole file (237 lines) |
| `Application.Tests/Services/Authentication/AuthenticationServiceTests.cs:514-563` | `#region Password Upgrade Tests` (`:514`, `#endregion` after `:585`) |
| `Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs:39` | one line — **not in the proposal** |
| `Application/Application.csproj:11` | `BCrypt.Net-Next` |
| `Authentication:Pepper` / `:Iterations` in three JSON files | see §4 |

**Explicitly untouched**: `backend/src/WebApi`, `backend/src/WebApiTest` (outside `SMCA.sln`, verified by reading
`SMCA.sln:10-28`); every E2E test file other than `DbTestHelpers.cs`; the private SHA256 helpers at
`Billing/RegisterStorePaymentTests.cs:35` and `Billing/GetReSellerCommissionsTests.cs:34` (proposal:101 — those
seeds are never read by `VerifyPassword`).

---

## 7. Commands for the user to run (I did not run any of these)

> **Correction (decision #1909)**: there is no dev-pepper `user-secrets` step — the pepper is
> already in `appsettings.json` and stays there. On the VPS, production overrides (if any) live
> in a gitignored `appsettings.Production.json` that the user manages himself, plus
> `ASPNETCORE_ENVIRONMENT=Production` in the compose `environment:` block.

```bash
# 1. register the new console project
dotnet sln backend/src/SMCA.sln add backend/src/SMCA.PasswordHasher/SMCA.PasswordHasher.csproj --solution-folder src

# 2. build
dotnet build backend/src/SMCA.sln

# 3. tests
dotnet test backend/src/Application.Tests/Application.Tests.csproj
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj     # needs postgres localhost:5432 / smca_test

# 4. the tool
dotnet run --project backend/src/SMCA.PasswordHasher -- "Password123"
```

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Isopoh member names in §ADR-6 are wrong (`EncodeString` / `DecodeString` / `SecureArray` / `FixedTimeEquals`) | **High** — none are verified | The implementer's **first** task is a compile-only spike against the installed package before any other work. `sdd-tasks` must sequence it first. |
| `MemoryCost` unit is not KiB | Medium | Same spike. A 1024× error is either an instant OOM or a worthless hash. Assert: the tool's stderr line reports a memory figure consistent with observed RSS. |
| No secret-aware `Argon2.Verify` overload exists | Medium | The decode-and-recompute shape in ADR-6 does not need one. It is the primary design, not the fallback. |
| ~~`ValidateOnStart()` needs a package~~ | — | **N/A — ADR-4 superseded, no longer applicable.** |
| E2E suite slows: ~35 seed sites × Argon2 at 16 MiB / t=2 | Medium | Measure first. If unacceptable, lower `Argon2MemoryKib`; there is no validator floor to respect (ADR-2 superseded), only "keep it representative of production." |
| 64 MiB × concurrent logins on the API | Low | `p=2`; documented sizing note; unchanged from the proposal. |
| `User.Password` column too short for a ~100-char PHC string | **Resolved, no risk** | `Password` is `text` in Postgres (`InitialCreate.cs:92`, verified 2026-08-05 per decision #1909) — unbounded, no migration needed. |
| ~~Docker dev run cannot resolve user-secrets~~ | — | **N/A — resolved by decision #1909**: no user-secrets in this design; see open question 1. |

---

## 9. Open questions the resolved decisions do not answer

1. **RESOLVED (decision #1909).** ~~How does the API get its pepper when run via docker-compose on Linux?~~
   Moot — the pepper is never in user-secrets, so the `docker-compose.override.yml:13` mount path is irrelevant
   to it. `docker-compose.yml` and `docker-compose.override.yml` are **not touched** by this change. Production
   configuration reaches the container the same way `ASPNETCORE_ENVIRONMENT` does today — a gitignored
   `appsettings.Production.json` plus `ASPNETCORE_ENVIRONMENT=Production` in the compose `environment:` block —
   set up and maintained by the user on the VPS, outside this change's scope.

2. **RESOLVED (decision #1909).** ~~Is `User.Password`'s column length sufficient?~~ Confirmed `text` (unbounded)
   in Postgres — `InitialCreate.cs:92`. No migration needed.

3. **Should the tool grow a `--verify <hash>` mode?** Still deliberately out of scope. Flagged because the natural
   next question after "generate me a hash" is "does this hash match this password", and answering it needs the
   same composition already built.
