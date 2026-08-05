# Proposal: Argon2id password hashing

## Intent

`AuthenticationSettings.Iterations` (`Application/Abstractions/Authentication/AuthenticationSettings.cs:7`, default `3`) carries **two incompatible meanings**: BCrypt work factor at `BcryptHashPasswordService.cs:17` (valid 4-31) and SHA256 re-hash rounds at `:59`. With `3` in both `SMCA.WebApi/appsettings.json:83` and `appsettings.Development.json:77`, `POST /v1/auth/register` throws in Development. The backend E2E suite never saw it because `SMCA.WebApi.E2ETests/appsettings.Tests.json:6` overrides exactly that field with `6` — the test environment patched the broken value instead of reproducing it.

Migrating to Argon2id deletes the overloaded field by construction, replaces bcrypt with the current OWASP recommendation, and removes three legacy verification paths that exist for production data this app has never had.

Success: registration works in Development; every hash the system produces is a self-describing Argon2id PHC string; no configuration field means two things; no committed pepper.

## Scope

### In Scope

1. **`Argon2idHashPasswordService`** replaces `BcryptHashPasswordService`, preserving `IHashPasswordService` (`HashPassword(string)`, `VerifyPassword(string,string)`) so the 5 call sites change by zero lines. Package: `Isopoh.Cryptography.Argon2` 2.0.0 (`Argon2Config.Secret` = pepper).
2. **Deletions** — all legacy-migration machinery for data that does not exist:
   - `LegacyHash()` (`BcryptHashPasswordService.cs:47-65`) and both legacy branches of `VerifyPassword` (`:26-29`, `:31-35`).
   - `NeedsUpgrade()` (`:42-45`) — concrete-class-only, not on the interface; its only caller is a unit test.
   - The in-band upgrade branch at `AuthenticationService.cs:50-56` (`if (!user.Password.StartsWith('$')) { re-hash; UpdateAsync }`). **Not in the exploration or the source doc** — found while writing this proposal. Argon2id PHC strings start with `$`, so it becomes permanently dead.
   - `SMCA.WebApi/Services/HashPasswordService.cs` — unregistered dead file.
   - `BCrypt.Net-Next 4.2.0` (`Application.csproj:11`) — the only production usage is the service being replaced.
3. **Settings reshape**: drop `Iterations`; add `Argon2MemoryKib` (65536), `Argon2TimeCost` (3), `Argon2Parallelism` (2), `Argon2SaltBytes` (16), `Argon2HashBytes` (32). The service **validates these at construction and throws with the offending field name** — the 2026 bug surfaced only at first hash, in one environment. Updates `appsettings.json:81-89`, `appsettings.Development.json:75-83`, `appsettings.Tests.json`.
4. **Pepper out of versioned config**: delete the plaintext value at `appsettings.json:82` / `appsettings.Development.json:76`. Source becomes the environment variable **`Authentication__Pepper`** (double underscore → `Authentication:Pepper`, consumed by the existing `GetSection(AuthenticationSettings.SectionName)` bind at `DependencyInjection.cs:60-61`). `WebApplication.CreateBuilder(args)` (`SMCA.WebApi/Program.cs:25`) already includes environment variables and, in Development, user secrets. Dev story: `dotnet user-secrets set "Authentication:Pepper" "<value>" --project backend/src/SMCA.WebApi` (`UserSecretsId` already exists: `SMCA.WebApi.csproj:8`).
5. **Unit tests**: `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs` (237 lines) rewritten against the new implementation; the two tests in `AuthenticationServiceTests.cs:514-563` (`#region Password Upgrade Tests`) removed with the branch they cover. Unit tests — allowed to change.
6. **E2E seed helper** (authorized, narrow): `SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs:21-22` produces a real Argon2id hash instead of raw SHA256. **The signature must stay `static string HashPassword(string)`** — grep shows ~35 call sites across `Infrastructure/*Seed.cs` and E2E **test bodies** (`OwnersUpdateTests.cs:171`, `UsersChangePasswordTests.cs:213`, `ExportOfflineRosterTests.cs:615,632,692`, `Billing/*`), and those files are not authorized to change. `AuthLoginSuccessTests.cs:22-41` and `UsersChangePasswordTests.cs:22-52` keep their current bodies and assertions and go green by exercising the real hashing path.
7. **`VerifyPassword` returns `false`, never throws**, for a malformed/non-PHC/empty stored hash. `AuthLoginFailureTests.cs` and `AuthLoginValidationTests.cs` depend on failure paths behaving cleanly.
8. **New console tool** — `SMCA.PasswordHasher`, at `backend/src/SMCA.PasswordHasher/SMCA.PasswordHasher.csproj`, `net8.0`, `<OutputType>Exe</OutputType>`, added to `SMCA.sln` under the existing `src` solution folder (`{79921FC4-A55E-468D-82F6-DC731768EE0C}`). No `Exe` project exists in the repo today to copy from. It `ProjectReference`s `Application` and resolves `IHashPasswordService` through the **same** service and the **same** bound `AuthenticationSettings` — configuration built from `SMCA.WebApi/appsettings.json` + user secrets + environment variables, no duplicated constants. It must declare `<UserSecretsId>9ddf385a-50c8-4201-b182-d2e4c77f6d79</UserSecretsId>` (same as `SMCA.WebApi.csproj:8`) to read the API's dev pepper; otherwise it silently hashes with a different secret and produces hashes the API rejects.

   Invocation: `dotnet run --project backend/src/SMCA.PasswordHasher -- "Password123"`

   Prerequisite: the pepper must be resolvable — either `dotnet user-secrets set "Authentication:Pepper" ...` (Development) or `export Authentication__Pepper='<value>'`. The tool prints the resolved parameters (memory/time/parallelism, pepper present yes/no) alongside the hash so a mismatch is visible, not silent.

### Out of Scope

- `backend/src/WebApi` and `backend/src/WebApiTest` — abandoned parallel API scaffolds outside `SMCA.sln`, each with its own SHA256 `HashPasswordService` copy. Untouched here; cleanup candidates for a separate change.
- Any existing E2E test file other than `DbTestHelpers.cs:21-22`.
- Progressive re-hashing / migration of stored hashes — premise is no production data.

## Capabilities

### New Capabilities
- `password-hashing`: how the backend derives and verifies password hashes — algorithm, parameters, storage format, pepper sourcing, failure behavior on malformed input, and the operator tool for generating a hash out-of-band. No existing spec in `openspec/specs/` covers backend password hashing (verified).

### Modified Capabilities
- None.

## Approach

Replace the implementation behind an unchanged interface, then delete everything that existed only to bridge to a format the system will no longer produce. The PHC string (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`) carries its own parameters, so raising cost later does not invalidate stored hashes and needs no schema change.

Test parameters get lowered for speed but **not below the point where the test environment can still reproduce a production failure** — this is the direct lesson of the bug being fixed. Concretely: `appsettings.Tests.json` may differ from production only in cost *magnitude* (proposed 16384 KiB / 2 / 1), never in shape, and never into a value the production config could not legally hold. Construction-time validation applies identically in every environment.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Application/Services/Authentication/BcryptHashPasswordService.cs` | Removed | Replaced by `Argon2idHashPasswordService.cs` |
| `Application/Services/Authentication/AuthenticationService.cs:50-56` | Removed | Legacy in-band hash upgrade |
| `Application/Abstractions/Authentication/AuthenticationSettings.cs:7` | Modified | `Iterations` → explicit Argon2 fields |
| `Application/DependencyInjection.cs:62` | Modified | New implementation registered |
| `Application/Application.csproj:11` | Modified | `-BCrypt.Net-Next`, `+Isopoh.Cryptography.Argon2` |
| `SMCA.WebApi/appsettings*.json` | Modified | New params; `Pepper` removed |
| `SMCA.WebApi/Services/HashPasswordService.cs` | Removed | Dead file |
| `SMCA.WebApi.E2ETests/appsettings.Tests.json` | Modified | Test-cost params |
| `SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs:21-22` | Modified | Authorized; real Argon2id hash |
| `Application.Tests/.../BcryptHashPasswordServiceTests.cs` | Removed | Rewritten for the new service |
| `Application.Tests/.../AuthenticationServiceTests.cs:514-563` | Removed | Upgrade-path tests |
| `backend/src/SMCA.PasswordHasher/` | New | Console tool |
| `backend/src/SMCA.sln` | Modified | Register the new project |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| E2E pepper becomes empty once removed from `appsettings.json` — `appsettings.Tests.json` has no `Pepper` and inherits it today | High | Open question below; must be resolved before `sdd-design` |
| `DbTestHelpers.HashPassword` is `static` with no DI access and must agree with the app-under-test's pepper | High | Signature frozen; config sourced from `appsettings.Tests.json`, already copied to `AppContext.BaseDirectory` (`SMCA.WebApi.E2ETests.csproj:34`) |
| E2E suite slows down — ~35 seed sites hash per test | Medium | Lower test cost (16 MiB / t=2 / p=1); measure before tuning further |
| Developer without the pepper env var gets silently different hashes | Medium | Fail fast on empty `Pepper`; tool echoes resolved params |
| 64 MiB per concurrent hash (1.2 GiB at 20 simultaneous logins) | Low | Documented sizing note; parallelism 2 |

## Rollback Plan

Single revert of the change branch: the interface never changed, so the 5 call sites are untouched and reverting restores `BcryptHashPasswordService` with its original settings. No database migration, no stored data in the new format outside local/test databases (drop and re-seed `smca_test`). The only manual step is restoring `Authentication:Pepper` in `appsettings.json`, or leaving it in the environment variable — the old `LegacyHash()` path reads the same bound field either way.

## Dependencies

- NuGet `Isopoh.Cryptography.Argon2` 2.0.0 (MIT, net8.0-compatible).
- The user sets `Authentication__Pepper` (or the dev secret) before running the API, the E2E suite, or the console tool. Nothing else works without it.

## Open Questions (need an answer before `sdd-design`)

1. **Where does the E2E suite get its pepper?** `appsettings.Tests.json` is 8 lines and defines no `Pepper`; the test host inherits `appsettings.json:82` today. Once that line is deleted, the E2E host binds `Pepper = ""`. Options: (a) a test-only `Pepper` literal in `appsettings.Tests.json` — not a real secret, keeps the suite self-contained, one source of truth for both the app and `DbTestHelpers`; (b) require `Authentication__Pepper` in the shell/CI before `dotnet test`, which fails loudly but adds a setup step to the documented command in `CLAUDE.md`. Recommendation: (a).
2. **Does `Development` keep a checked-in dev pepper anywhere, or is `dotnet user-secrets` mandatory before the API starts?** Recommendation: mandatory, with a startup failure naming the missing key.

## Resolved and NOT reopened

Argon2id (no interim bcrypt patch) · `Isopoh.Cryptography.Argon2` 2.0.0 · pepper as `Secret` and out of versioned config · authorization limited to `DbTestHelpers.cs:21-22`.

## Verified non-issues

- Two private raw-SHA256 `HashPassword` copies exist inside E2E test files (`Billing/RegisterStorePaymentTests.cs:35`, `Billing/GetReSellerCommissionsTests.cs:34`), outside the authorization. Only `Auth/AuthLogin*.cs` and `Users/UsersChangePasswordTests.cs` POST to `/api/v1/auth/login` (grepped) — those two Billing files never verify a password, so their seeds are never read by `VerifyPassword`. **No change needed, no authorization requested.**
- `Auth/AuthLoginTests.cs` — empty credentials (400) and unknown user (401); never reaches `VerifyPassword`.
- No `HasData`/`InsertData` password hashes in any of the 22 files under `Infrastructure/Migrations` (per exploration).

## Success Criteria

- [ ] `POST /v1/auth/register` succeeds in Development with no `Authentication:Iterations` present anywhere.
- [ ] Every stored hash is an Argon2id PHC string; grep finds no `BCrypt`, `LegacyHash`, or `NeedsUpgrade` in `backend/src` inside `SMCA.sln`.
- [ ] `AuthLoginSuccessTests.cs` and `UsersChangePasswordTests.cs` pass **unmodified**, now exercising real Argon2id verification.
- [ ] `frontend-react/e2e/register.spec.ts` REQ-6 and REQ-8 green.
- [ ] `dotnet run --project backend/src/SMCA.PasswordHasher -- "Password123"` prints a hash that `POST /auth/login` accepts when seeded into the database.
- [ ] Starting the API with no pepper configured fails at startup naming `Authentication:Pepper`, not at first registration.
- [ ] `Pepper` no longer appears in `appsettings.json` or `appsettings.Development.json`. (`JwtSecretKey` at `appsettings.json:84` is the same class of problem but is **out of scope** here — flagged, not fixed.)
