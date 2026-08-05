# Tasks: Argon2id password hashing

> Supersedes: pepper-in-user-secrets, startup fail-fast, `IValidateOptions` (decision #1909).
> Pepper stays in `appsettings.json`. No `dotnet` command runs except by the user — every
> such task is marked **BLOCKED ON USER** with the literal command. Strict TDD is disabled
> for this change (Standard Mode). E2E rule: only `DbTestHelpers.HashPassword`'s *body* may
> change; signature frozen; no other existing E2E test touched without asking first.

**Out of scope (explicit, no task produced)**: regenerating the seeded `admin` hash at
`UserEntityTypeConfiguration.cs:40-44` and its EF migration/SQL script mirror. Consequence:
seeded `admin` cannot log in until the user runs the console tool and does the `UPDATE`
himself.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-1000 (new project + service + deletions across 8 files) |
| 400-line budget risk | High |
| Chained PRs recommended | No — project convention forbids PRs/chaining/size:exception for this change |
| Suggested split | Single branch, 6 work-unit commits (below) |
| Delivery strategy | commits-only on new branch from current branch (`main`), no push |
| Chain strategy | pending (N/A — no PR mechanism used; see note) |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High
```

Note: the four enum chain-strategy values assume a PR workflow. This change explicitly has
none — delivery is commits-only on a branch created from the current branch. `pending` is
the closest fit and should be read as "not applicable."

### Suggested Work Units (commits, not PRs)

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| WU1 | Settings reshape + config files + `.gitignore` | 1 | Phase 1 |
| WU2 | Argon2id service + its unit tests | 1 | Phase 2, after Phase 0 spike confirms the API |
| WU3 | Wire-in + delete all legacy code/tests | 1 | Phase 3 |
| WU4 | E2E seed helper body | 1 | Phase 4 |
| WU5 | Console tool project | 1 | Phase 5, ends with the exact user-facing command |
| WU6 | none — Phase 6 is user-run verification only, no commit | — | |

## Phase 0: API validation — RESOLVED, no spike needed

The `⚠️ NOT VERIFIED` marks on the Isopoh API are cleared. Verified against the package
source at `github.com/mheyman/Isopoh.Cryptography.Argon2` (`master`):

- `Argon2Config` properties: `HashLength` (int, 32), `Password` (byte[]?), `Salt` (byte[]?),
  `Secret` (byte[]?), `AssociatedData` (byte[]?), `TimeCost` (int, 3), `Lanes` (int, 4),
  `Threads` (int, 1), `Type` (`Argon2Type`, `HybridAddressing`), `Version`
  (`Argon2Version`, `Nineteen`), `MemoryCost` (int, 65536).
- **`MemoryCost` is in 1024-byte blocks** — `65536` = 64 MiB. The planned value is correct.
- `Argon2Type.HybridAddressing` is Argon2id; `Argon2Version.Nineteen` is 0x13. Both confirmed.
- Static helpers make the manual encode/decode path unnecessary:
  - `public static string Hash(Argon2Config configToHash)` — returns the PHC string.
  - `public static bool Verify(string encoded, string password, string? secret, SecureArrayCall? secureArrayCall = null)` — returns bool.
- ⚠️ **Parameter order footgun**: `Verify` takes `(encoded, password, secret)` — the stored
  hash comes FIRST, not the password.
- `SecureArray<byte>`, `EncodeString`/`DecodeString` and `FixedTimeEquals` are NOT needed —
  design ADR-6's manual path is superseded by the two static helpers above.
- ⚠️ **NOT VERIFIED**: the default salt length when `Argon2Config.Salt` is left null. Task 2.1
  sidesteps this by always supplying an explicit 16-byte salt, so the default never applies.

No tasks. The package reference is a plain XML line added by hand to
`Application/Application.csproj`, next to the existing `BCrypt.Net-Next` one at `:11`
(`<PackageReference Include="Isopoh.Cryptography.Argon2" Version="2.0.0" />`). It is covered
by task 1.0 — no `dotnet add package` invocation is needed, and nothing is installed ahead
of time: the restore happens on the user's next build.

## Phase 1: Settings and config (WU1)

- [x] 1.0 `Application/Application.csproj` — add `<PackageReference Include="Isopoh.Cryptography.Argon2" Version="2.0.0" />` alongside the existing `BCrypt.Net-Next` line at `:11`. Hand-edited XML; no CLI invocation.
- [x] 1.1 Edit `AuthenticationSettings.cs`: remove `Iterations` (`:7`); add `Argon2MemoryKib`, `Argon2TimeCost`, `Argon2Parallelism`, `Argon2SaltBytes`, `Argon2HashBytes` (`int`, default `0`). Keep `Pepper` (`:6`) and `:8-12` unchanged.
- [x] 1.2 `SMCA.WebApi/appsettings.json:81-89` — drop `Iterations`; add the five fields (`65536`, `3`, `2`, `16`, `32`); `Pepper` untouched.
- [x] 1.3 `SMCA.WebApi/appsettings.Development.json:75-83` — same edit, same values, `Pepper` untouched.
- [x] 1.4 `SMCA.WebApi.E2ETests/appsettings.Tests.json:5-7` — replace `Iterations: 6` with all six `Authentication` keys explicit (incl. a test-only `Pepper` literal) — `DbTestHelpers` reads this file alone, no merge. Values low but representative, e.g. `16384/2/1/16/32`.
- [x] 1.5 Add `appsettings.Production.json` to `.gitignore`.

## Phase 2: Core hashing service (WU2)

- [x] 2.1 Create `Application/Services/Authentication/Argon2idHashPasswordService.cs` (sealed, ctor `(IOptions<AuthenticationSettings>)`, mirrors `BcryptHashPasswordService.cs:10-13`). `HashPassword`: fresh `RandomNumberGenerator` salt, full-control `Argon2Config`, pepper as `Secret`, returns PHC string. No construction-time validation.
- [x] 2.2 `VerifyPassword`: uses the verified `Argon2.Verify(encoded, password, secret)` static helper wrapped in try/catch; returns `false` (never throws) for `null`/empty/malformed/foreign-format `storedHash`. (Supersedes design ADR-6's manual decode-then-recompute shape per the confirmed Isopoh 2.0.0 API — no `DecodeString`/`SecureArray`/`FixedTimeEquals`.)
- [x] 2.3 `Application.Tests/Services/Authentication/Argon2idHashPasswordServiceTests.cs`: same-password-twice differs; correct verifies true; wrong verifies false; `null`/`""`/bcrypt-shaped/raw-SHA256/truncated stored values all return `false` without throwing; hash under pepper A fails under pepper B.

## Phase 3: Wire in, delete legacy (WU3)

- [x] 3.1 `DependencyInjection.cs:62` — swap to `AddScoped<IHashPasswordService, Argon2idHashPasswordService>()`. No validator line.
- [x] 3.2 Delete `Application/Services/Authentication/BcryptHashPasswordService.cs` (66 lines — takes `LegacyHash()`, both legacy branches, `NeedsUpgrade()` with it).
- [x] 3.3 Delete `SMCA.WebApi/Services/HashPasswordService.cs` (unregistered dead file).
- [x] 3.4 Delete `AuthenticationService.cs:50-56` (legacy upgrade block); confirm the reseller check follows directly.
- [x] 3.5 Delete `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs` (237 lines; superseded by 2.3).
- [x] 3.6 Delete `#region Password Upgrade Tests` `AuthenticationServiceTests.cs:514-589` (both tests, `#endregion` at `:589`).
- [x] 3.7 `RefreshCommandHandlerTests.cs:39` — delete the `Iterations = 3` line.
- [x] 3.8 Grep `BCrypt` across `backend/`; if only `Application.csproj:11` remains, remove that `PackageReference` line (hand-edited XML). Compile confirmation happens in Phase 6. (One harmless comment remains at `AuthenticationServiceTests.cs:76` — anticipated by design ADR-7, not a namespace reference.)

## Phase 4: E2E seed helper — the one authorized E2E change (WU4)

- [x] 4.1 `DbTestHelpers.cs:21-22` — body only, signature frozen (`public static string HashPassword(string password)`). New body: private static lazily-initialized `Argon2idHashPasswordService` built from `appsettings.Tests.json` in `AppContext.BaseDirectory` (per design ADR-5); `HashPassword` delegates to it. No other line, no other E2E file, changes.
- [x] 4.2 CANCELLED by the user — `PasswordHashParityTests.cs` is not added. No E2E test file other than `DbTestHelpers.cs` was touched.

## Phase 5: Console tool (WU5)

- [x] 5.1 Create `backend/src/SMCA.PasswordHasher/SMCA.PasswordHasher.csproj` — `Exe`, `net8.0`, no `UserSecretsId`. Packages: `Microsoft.Extensions.Configuration.Json/EnvironmentVariables/Binder` (8.0.0). `ProjectReference` to `Application` only. Link `..\SMCA.WebApi\appsettings.json`, `CopyToOutputDirectory=PreserveNewest`.
- [x] 5.2 `Program.cs`: config = linked `appsettings.json` + optional `appsettings.Production.json` + env vars; bind `AuthenticationSettings`; construct `Argon2idHashPasswordService` directly (no `IHost`). Argv: exactly 1 non-whitespace arg → hash to stdout, diagnostics to stderr; 0 or 2+ args → usage to stderr, exit 1.
- [x] 5.3 Register the project in `backend/src/SMCA.sln` by hand-editing the file: `Project(...)` GUID block (`{18433F62-FCE4-4B24-950B-FBF7F055A049}`), `ProjectConfigurationPlatforms` entries, and the `NestedProjects` line placing it under the `src` solution folder — mirroring the existing entries. No `dotnet sln add` invocation.
- [ ] 5.4 Compile confirmation happens in Phase 6 (user-run — BLOCKED ON USER).
- [x] 5.5 **Deliverable — the command the user runs to hash a password**, documented verbatim in `Program.cs` usage text and in the commit message:
  ```bash
  dotnet run --project backend/src/SMCA.PasswordHasher -- "Password123"
  ```

## Phase 6: Verification (all BLOCKED ON USER — nobody but the user runs `dotnet`)

- [ ] 6.1 `dotnet test backend/src/Application.Tests/Application.Tests.csproj`
- [ ] 6.2 `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (needs Postgres `localhost:5432`/`smca_test`)
- [ ] 6.3 `dotnet test backend/src/SMCA.sln`
- [ ] 6.4 Confirm the `admin`-account-out-of-scope consequence is stated in the final summary/commit message — no code task.
