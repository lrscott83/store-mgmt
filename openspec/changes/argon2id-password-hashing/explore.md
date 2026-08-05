## Exploration: Argon2id password hashing migration

### Current State

`BcryptHashPasswordService` (`backend/src/Application/Services/Authentication/BcryptHashPasswordService.cs`) implements `IHashPasswordService` (`backend/src/Application/Abstractions/Authentication/IHashPasswordService.cs:3-7`, interface = `HashPassword(string)` + `VerifyPassword(string,string)` only — no `NeedsUpgrade` in the interface). `VerifyPassword` (:20-36) has **three** branches, not two:
1. `:23-24` `storedHash.StartsWith('$')` → real BCrypt verify (doc's `:23-24` citation is this branch, NOT the legacy one — doc mislabels it).
2. `:26-29` SHA256+pepper "LegacyHash" verify, calling private `LegacyHash()` (`:47-65`). `Iterations` here means SHA256 re-hash rounds.
3. `:31-35` **raw SHA256 (no salt, no pepper) fallback** — not named or discussed anywhere in the source doc as a separate deletable unit.

`HashPassword` (:15-18) uses `Iterations` as the BCrypt work factor (2^n, valid range 4-31). Confirmed: `AuthenticationSettings.Iterations` (`Application/Abstractions/Authentication/AuthenticationSettings.cs:7`, default `3`) is the single field feeding both meanings — root cause of the `ArgumentOutOfRangeException` in Development (`appsettings.json:83`=3, `appsettings.Development.json:77`=3, both invalid as a BCrypt work factor). `SMCA.WebApi.E2ETests/appsettings.Tests.json:6` overrides `Iterations: 6` only (no `Pepper` override — inherits `B1BBA4F5-AB26-4175-96D5-22642F50A2BB` from the base file), which is why AuthRegisterSuccessTests passes while dev registration 500s.

DI: `Application/DependencyInjection.cs:60-62` confirmed — `Configure<AuthenticationSettings>` then `AddScoped<IHashPasswordService, BcryptHashPasswordService>()`.

`BcryptHashPasswordService` also exposes `NeedsUpgrade(string)` (:42-45, `!storedHash.StartsWith('$')`) as a **concrete-class-only** public method, not part of `IHashPasswordService`. Grepped every call site: the ONLY caller is `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs` (3 tests, `NeedsUpgrade_*`). No production code calls it (consumers only ever hold `IHashPasswordService`, which doesn't declare it) — it's dead in production, alive only in this one test file. The doc never mentions this method at all.

### Dead-code verification (`SMCA.WebApi/Services/HashPasswordService.cs`)

Confirmed dead as claimed: `SMCA.WebApi/Services/HashPasswordService.cs:7` implements `IHashPasswordService` (SHA256-deterministic with hardcoded pepper `B1BBA4F5-...` and `_iteration=3`) but grepped across the whole repo — the only DI registration for `IHashPasswordService` inside anything that's part of `SMCA.sln` is `Application/DependencyInjection.cs:62` (→ `BcryptHashPasswordService`). `SMCA.WebApi/Services/HashPasswordService.cs` is never registered, never referenced anywhere else. Safe to delete.

**Correction/addition to the doc**: there is a THIRD, near-identical `HashPasswordService.cs` at `backend/src/WebApiTest/Services/HashPasswordService.cs:7` (SHA256, hardcoded pepper, `_iteration=3`), registered at `backend/src/WebApiTest/Program.cs:39` (`AddScoped<IHashPasswordService, HashPasswordService>()`). `WebApiTest` is a **whole separate ASP.NET Core project that is NOT listed in `SMCA.sln`** (verified by reading the full `.sln` file — only Domain, Application, Domain.UnitTests, Infrastructure, Resources, SMCA.WebApi, SMCA.Presentation, docker-compose, Application.Tests, SMCA.WebApi.E2ETests are in it). There is also a fourth project, `WebApi/WebApi.csproj` (FastEndpoints-based), also not in the sln. Both `WebApi` and `WebApiTest` appear to be abandoned parallel API scaffolds — out of scope for this migration (nothing in the sln references them), but flagged because the doc's "files to touch" list didn't mention their existence at all.

### 5 hashing call sites — confirmed, all inject `IHashPasswordService` only

- `Application/Services/Owners/CreateOwnerService.cs:17,21`
- `Application/Services/Authentication/AuthenticationService.cs:16,21`
- `Application/Features/Management/Users/Commands/CreateStoreUser/CreateStoreUserCommand.cs:31,42`
- `Application/Features/Administration/ReSellers/Commands/CreateReSeller/CreateReSellerCommand.cs:35,44`
- `Application/Features/UserManagement/Users/Commands/UpdateUserPassword/UpdateUserPasswordCommand.cs:27,34` (read in full — calls `VerifyPassword` then `HashPassword`, nothing concrete-type-specific)

None cast to the concrete type or call `NeedsUpgrade`. All would need zero changes if `HashPassword`/`VerifyPassword` signatures are preserved.

### Legacy-hash risk — corrects the doc's biggest blind spot

No `HasData`/`InsertData` seeded password hashes exist anywhere in `backend/src/Infrastructure/Migrations` (grepped all 22 migration files — zero matches). `UserEntityTypeConfiguration.cs` has no `HasData` for `Password`. So the doc's premise (no seeded/migrated production password hashes in the codebase) holds for migrations.

**But this is not the whole risk surface.** `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs:21-22` — `HashPassword(string password) => Convert.ToBase64String(SHA256.HashData(...))` — seeds E2E test users with **raw SHA256, no salt, no pepper**, i.e. exactly the hash shape verified only by the THIRD branch (`BcryptHashPasswordService.cs:31-35`) that the source doc never named as a distinct thing to preserve/delete. This helper is used by `UserSeed.cs`, `AuthTestHelpers.cs`, and directly inside `DbTestHelpers.cs` (4 use sites total) to seed nearly every E2E test user.

Confirmed by reading full test bodies — two **existing E2E tests** perform a REAL password verify (not `AuthedClient`'s JWT-minting bypass) against a `DbTestHelpers.HashPassword`-seeded raw-SHA256 hash and would need branch 3 (or an equivalent legacy-format fallback) to keep passing:
- `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginSuccessTests.cs:22-41` (`Login_with_seeded_super_admin_returns_200_and_token`) — POSTs to `/api/v1/auth/login` with the plaintext password against a raw-SHA256 seeded hash, expects 200.
- `backend/src/SMCA.WebApi.E2ETests/Users/UsersChangePasswordTests.cs:22-52` (`Change_own_password_returns_200_and_relogin`) — the initial `OldPassword` check in `/users/change-password` verifies against the same raw-SHA256 seeded hash before the password is ever changed.

Most other E2E tests that call `DbTestHelpers.SeedSuperAdminAsync`/`UserSeed.*` use `DbTestHelpers.AuthedClient` (`DbTestHelpers.cs:120-126`), which mints a JWT directly via `AuthTestHelpers.MintToken` and never calls `VerifyPassword` — those are NOT affected. `AuthLoginFailureTests.cs` (`Login_with_wrong_password...`, `Login_with_inactive_user...`) and `AuthLoginValidationTests.cs` expect failures anyway, so they likely still pass under a new implementation, PROVIDED the new `VerifyPassword` returns `false` for a malformed/non-PHC stored string instead of throwing — this is a design constraint to carry into `sdd-design`, not yet resolved.

**This is an E2E-test-touching risk the source doc completely missed.** Per `CLAUDE.md`'s non-negotiable rule, if branch 3 is deleted outright (as "no production data" would suggest), `AuthLoginSuccessTests.cs` and `UsersChangePasswordTests.cs` break — these are EXISTING E2E tests and may NOT be touched without the user's explicit authorization. The three real options for `sdd-propose` to present:
1. Ask the user to authorize updating these two E2E tests' seed helper to produce a real Argon2id/BCrypt hash instead of raw SHA256 (this is arguably a bug in test fixtures, not a behavior change, but it is still "touching an existing E2E test" under the letter of the rule — ask first).
2. Keep a minimal legacy-verify fallback (contradicts the doc's "delete everything, no production data" premise, but avoids touching E2E tests).
3. Something else the user proposes.
Do NOT decide this without asking — flagged for `sdd-propose`.

### NuGet package reality check (verified via WebFetch of official README/NuGet pages, not memory)

Both `net8.0`-compatible (repo TFM confirmed `net8.0` across every `.csproj` — no `Directory.Build.props` or `Directory.Packages.props` exist, so no central package management; each project pins its own versions, e.g. `Application.csproj:11` already references `BCrypt.Net-Next 4.2.0`).

- **Isopoh.Cryptography.Argon2** — latest stable **2.0.0** (2023-08-17). Targets `.NET 6.0+`, `.NET Core 3.1`, `.NET Standard 2.0` — compatible with `net8.0`. API (quoted from README): simple form `Argon2.Hash(password)` / `Argon2.Verify(passwordHash, password)`; full-control form via `Argon2Config { Type, Version, TimeCost, MemoryCost, Lanes, Threads, Password, Salt, Secret, AssociatedData, HashLength }` → `new Argon2(config).Hash()`. **`Secret` is the pepper/known-secret parameter.**
- **Konscious.Security.Cryptography.Argon2** — latest stable **1.3.1** (2024-06-19). Targets `.NET 6.0+`, `.NET Standard 1.3+`, `.NET Framework 4.6+` — compatible with `net8.0`. API: `class Argon2id(password)` with settable `DegreeOfParallelism`, `MemorySize`, `Iterations`, `Salt`, `AssociatedData`, and **`KnownSecret`** (byte[]) for the pepper, `GetBytes(int)` to produce the raw hash. Confirms both packages support a pepper — resolves the doc's "⚠️ NO VERIFICADO" on this point.

### Console tool feasibility

- `SMCA.sln` (read in full) lists 10 projects across two solution folders (`src`, `tests`); adding a project means adding a `Project(...)` GUID block + `ProjectConfigurationPlatforms`/`NestedProjects` entries, or running `dotnet sln add`.
- **No console/tool project exists anywhere in the repo to copy from.** Grepped every `.csproj` for `OutputType` — zero matches (no `Exe` project exists at all). `WebApi` and `WebApiTest` (both outside the sln) are `Microsoft.NET.Sdk.Web`, not console apps.
- Settings binding pattern to reuse: `services.Configure<AuthenticationSettings>(configuration.GetSection(AuthenticationSettings.SectionName))` (`Application/DependencyInjection.cs:60-61`) — a new console project can do the same via `Microsoft.Extensions.Configuration` + `Microsoft.Extensions.Options.ConfigurationExtensions` (already a package the `Application` project references, `Application.csproj:12`) pointed at the same `appsettings.json`, so it loads the SAME real parameters rather than duplicating constants — exactly what the user wants.
- TFM for the new project: `net8.0` (matches every other project; no central package management file constrains/forces version alignment, so it must be set explicitly per the sibling `.csproj` pattern, e.g. `Application.csproj:1-7`).

### Test surface (verified by reading, not the doc's summary)

- `Application.Tests/Services/Authentication/AuthenticationServiceTests.cs` and `Application.Tests/Services/Owners/CreateOwnerServiceTests.cs` — both use `Mock<IHashPasswordService>` (confirmed via grep). Keep passing unchanged if the interface signature is preserved.
- `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs` (237 lines, NOT mentioned anywhere in the source doc) — tests the CONCRETE `BcryptHashPasswordService` directly: BCrypt roundtrip, `VerifyPassword_legacySHA256Hash_returns_true`, `VerifyPassword_legacyRawSHA256_returns_true`, and all 3 `NeedsUpgrade_*` tests. **This whole file is a unit test (not E2E) that is FORCED to change or be deleted** when `BcryptHashPasswordService`/`LegacyHash`/`NeedsUpgrade` are replaced — it directly instantiates the concrete type being replaced. Since it's a unit test, not an E2E test, this is allowed under the project's rules, but it's a real, sizeable deletion/rewrite (237 lines) the doc never flagged.
- E2E: see "Legacy-hash risk" above for the two existing E2E tests (`AuthLoginSuccessTests.cs`, `UsersChangePasswordTests.cs`) that would break if branch 3 (`raw SHA256 fallback`) is deleted without also fixing how they seed passwords — flagged for explicit user authorization before touching.
- `frontend-react/e2e/register.spec.ts` REQ-8 (`Login_...returns 201`) and REQ-6 (duplicate → 400) — read in full. These do NOT seed via `DbTestHelpers`; they go through the real `/register` endpoint, i.e. through `HashPassword` (BCrypt work-factor path), which is exactly what the `Iterations=3` bug breaks today. Confirmed both go green once `HashPassword` stops throwing (minimal fix or Argon2id, whichever lands first — doc's claim holds).

### Three open decisions — recommendations

1. **Minimal bcrypt fix first vs. straight to Argon2id.** Recommend: minimal fix first, land it in an hour, unblock Development/the 2 red Playwright tests today; then do Argon2id as its own change. Tradeoff: two migrations' worth of review instead of one, but the current state is Development is completely broken for registration — that's a production-blocking bug independent of the algorithm decision, and the Argon2id migration is a bigger, riskier change (new packages, new settings shape, the E2E-test question above) that shouldn't be gated behind unblocking basic registration. This also decouples "fix a 500" (urgent, small, easy to review) from "swap hashing algorithm + delete legacy paths + touch E2E test seeding" (needs the user's sign-off on the E2E question first).
2. **Isopoh vs Konscious.** Recommend Isopoh: it produces the self-describing PHC string (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), matching the existing `storedHash.StartsWith('$')`-style dispatch pattern already in the codebase (the current code already special-cases hashes by their string shape) and letting future cost-parameter bumps happen without a schema/column change or extra stored columns. Konscious returns raw bytes only — the codebase would then own PHC-encoding by hand, which is exactly the kind of homegrown crypto-format code that produced today's overloaded-`Iterations` bug in the first place. Isopoh's 100%-managed implementation also avoids native-interop concerns; both are equally free/OSS so licensing isn't a differentiator.
3. **Pepper.** Recommend using it as Argon2's `Secret` (Isopoh) / `KnownSecret` (Konscious) — it's the parameter's exact designed purpose, and today's `Pepper` field is dead weight on the BCrypt path (only `LegacyHash()` reads it, confirmed at `BcryptHashPasswordService.cs:49`) while doing real work in Argon2. It currently ships in plaintext at `SMCA.WebApi/appsettings.json:82` (`"Pepper": "B1BBA4F5-AB26-4175-96D5-22642F50A2BB"`) — confirmed committed to git, versioned config. A committed pepper defeats its own purpose (an attacker with repo/CI access gets it for free). Recommend moving it to an environment variable / secret store (e.g. `dotnet user-secrets` in dev, real secret manager in any future deployed environment) before wiring it into Argon2 — this is a config-hygiene fix that should ride along with this migration since the field is being touched anyway, but it is a genuine scope question for `sdd-propose` to confirm with the user (env var name, whether Development keeps a checked-in dev-only value, etc.).

### Risks

- **E2E-test-touching risk (see above)** — `AuthLoginSuccessTests.cs` and `UsersChangePasswordTests.cs` depend on a raw-SHA256 legacy verify path the source doc never named. Must ask the user before any change that would break them.
- `Application.Tests/Services/Authentication/BcryptHashPasswordServiceTests.cs` (237 lines) needs a full rewrite/replacement — larger unit-test surface than the doc implied.
- Pepper relocation out of versioned config is a scope decision, not yet made.
- `WebApi` and `WebApiTest` projects exist outside `SMCA.sln` with their own SHA256-based `HashPasswordService` copies — confirmed dead/unused for this migration, but worth the user knowing they exist (possible future cleanup candidates, out of scope here).

### Ready for Proposal

Yes, with one hard gate: `sdd-propose` (or the user directly) MUST resolve the E2E-test question (raw-SHA256 seed helper vs. keeping a legacy-verify path) before `sdd-design`/`sdd-tasks` can commit to "delete all legacy paths." Everything else investigated is sufficient to proceed.
