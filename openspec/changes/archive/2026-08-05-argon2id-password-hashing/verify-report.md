# Verify Report: argon2id-password-hashing

Date: 2026-08-05
Branch: `feat/argon2id-password-hashing` (6 commits, pushed)
Verification method: static — read code + `git diff main...HEAD`. No `dotnet` command run
by this agent (hard constraint). User separately ran `dotnet build`/`dotnet test` (Application.Tests,
SMCA.WebApi.E2ETests) and the console tool — all reported passing, output:
`$argon2id$v=19$m=65536,t=3,p=2$df7wfdeYzyL1w1UzyZlozg$feDBN4XvRAfzO/peZiyCWl2eh7FnVDdxJogjFY5yH64`
(matches `appsettings.json` production values: m=65536, t=3, p=2, 16B salt/22 b64 chars, 32B hash/43 b64 chars).

## Status: PASS with 1 WARNING, 1 SUGGESTION, 0 CRITICAL

## Spec requirement verification (`specs/password-hashing/spec.md`)

| Requirement | Verdict | Evidence |
|---|---|---|
| Argon2id hash generation, fresh salt per call | PASS | `Argon2idHashPasswordService.cs:20,36` — `RandomNumberGenerator.GetBytes` per call, `Argon2.Hash(config)`; unit test `HashPassword_samePassword_differentHashes` |
| Verify round-trip (true/false) | PASS | `Argon2idHashPasswordService.cs:39-52`; tests `VerifyPassword_correct_returns_true`, `VerifyPassword_incorrect_returns_false` |
| Malformed stored hash never throws | PASS | `:41-42` null/empty short-circuit + `:44-51` try/catch around `Argon2.Verify`; tests cover null/empty/bcrypt-shaped/raw-SHA256/truncated (`Argon2idHashPasswordServiceTests.cs:85-134`) |
| Pepper participates in hash (`Secret`) | PASS | `:33` (hash) `Secret = Encoding.UTF8.GetBytes(_settings.Pepper)`; `:46` (verify) `Argon2.Verify(storedHash, password, _settings.Pepper)`; test `VerifyPassword_hashedUnderDifferentPepper_returns_false` |
| Pepper stays in `appsettings.json`, no user-secrets, no fail-fast | PASS | `appsettings.json:82`, `appsettings.Development.json:76` unchanged value; `DependencyInjection.cs:60-62` has no `IValidateOptions`/`ValidateOnStart`; grep for `IValidateOptions\|ValidateOnStart\|AuthenticationSettingsValidator` across `backend/src` → zero hits; `SMCA.WebApi.csproj`/`Program.cs` diff is empty (pre-existing unrelated `UserSecretsId` untouched) |
| Explicit, distinctly-named cost parameters | PASS | `AuthenticationSettings.cs:7-11` — 5 separate `int` fields, no validator type exists |
| No legacy verification paths | PASS | `BcryptHashPasswordService.cs` deleted (confirmed absent on disk); `SMCA.WebApi/Services/HashPasswordService.cs` deleted; `AuthenticationService.cs:44-50` — `VerifyPassword` check flows directly into the reseller check, no upgrade branch; grep `NeedsUpgrade\|LegacyHash` across `backend/` → zero hits |
| E2E seed/app pepper parity | PASS | `DbTestHelpers.cs:21-38` builds its hasher from `appsettings.Tests.json` at `AppContext.BaseDirectory`; `AppTestFactory.cs:19-24` adds the identical path as the last config source for the app under test — same file, same values |
| Console tool produces app-compatible hash | PASS | `SMCA.PasswordHasher/Program.cs` links `appsettings.json` (+ Development/Production overlays) from `SMCA.WebApi`, binds the same `AuthenticationSettings`, constructs the same `Argon2idHashPasswordService`; user-run output matches production config shape |

## Tasks.md cross-check

All `[x]` items in Phases 1–5 (1.0–1.5, 2.1–2.3, 3.1–3.8, 4.1, 5.1–5.3, 5.5) verified against actual
code state — genuinely implemented, no false-done items found. Task 4.2 correctly marked CANCELLED
(no `PasswordHashParityTests.cs` added — confirmed absent). Task 5.4 and all of Phase 6 correctly
left unchecked (`[ ]`) — BLOCKED ON USER, consistent with tasks.md's own annotation; user has since
run these independently (see evidence note above) but that isn't reflected in tasks.md checkboxes,
which is expected since this agent doesn't edit tasks.md.

## Constraint checks (CLAUDE.md, decision #1909, design)

- `IHashPasswordService` signature unchanged (`IHashPasswordService.cs:5-6`); all 5 real call sites
  (`CreateStoreUserCommand.cs`, `CreateReSellerCommand.cs`, `UpdateUserPasswordCommand.cs`,
  `CreateOwnerService.cs`, `AuthenticationService.cs`) have zero diff in `git diff main...HEAD --stat`.
- `AuthenticationSettings.Iterations` fully removed; remaining `Iterations` hits across the repo are
  the unrelated PBKDF2 `OfflineVerifierService`/`StoreKeyWrapService`/offline-roster DTOs — confirmed
  by grep, matches design ADR-3's own grep inventory.
- `appsettings.Production.json` added to `.gitignore:159`; not present on disk in the repo (correct —
  VPS-only, gitignored, never committed); `appsettings.json`, `appsettings.Development.json`,
  `appsettings.Tests.json` kept git-tracked status, values-only edits, no restructuring.
- Seeded `admin` account at `UserEntityTypeConfiguration.cs:40-44` — zero diff, confirmed untouched;
  zero diff under `Infrastructure/Migrations/` — no EF migration created. Matches explicit out-of-scope
  decision (#1909, spec Non-Goals).
- No docker-compose changes (`docker-compose.yml`, `docker-compose.override.yml` — zero diff).

## WARNING

**W1 — `appsettings.Tests.json` differs, alongside `DbTestHelpers.cs`, within `SMCA.WebApi.E2ETests/`.**
`git diff main...HEAD --stat -- backend/src/SMCA.WebApi.E2ETests/` shows two files: `Infrastructure/DbTestHelpers.cs`
(authorized) and `appsettings.Tests.json` (6 lines: `Iterations: 6` replaced by the 6 explicit
`Authentication` keys). This technically diverges from the "only `DbTestHelpers.cs` may differ" framing
given at the start of this verify pass. Assessment: not a CRITICAL E2E-test violation — the file is
configuration data, not test logic or assertions; no test file's behavior, skip state, or expectations
changed; the edit was explicitly planned in `tasks.md` task 1.4 (Phase 1, not the "authorized E2E change"
Phase 4) and listed in decision #1909's own "Where" section, meaning it went through the same SDD
approval the rest of the change did. It is also structurally required for the spec's own "E2E seed and
application pepper/parameter parity" requirement to hold — without it, `DbTestHelpers` would still bind
a deleted `Iterations` field into an `AuthenticationSettings` POCO that no longer reads it, silently
defaulting every Argon2 field to `0`. Recommend the user explicitly confirm this was intended scope for
"the only authorized E2E change," since the phrase in tasks.md's header ("only `DbTestHelpers.cs`'s body
may change; signature frozen") could be read as also excluding this file.

> **Resolved at archive time (2026-08-05):** confirmed accepted, no code change required.
> `appsettings.Tests.json` is a configuration file, not a test — CLAUDE.md's non-negotiable rule
> protects existing E2E *tests* (behavior/assertions/skip-state), not configuration data. The edit
> was planned in `tasks.md` task 1.4 and approved by the user as part of this change. Recorded here
> as accepted scope, not an outstanding risk.

## SUGGESTION

**S1 — Console tool's arg contract diverges from `tasks.md` 5.2 / `design.md` ADR-8, in a way tasks.md
was never updated to reflect.** Commit `8df2659` (authored directly by the user, after the 5 WU apply
commits) changed `Program.cs` argv handling from "exactly 1 arg, else usage+exit 1" to "1 or 2 args,
second optional arg = environment override" (`Program.cs:23,32-34`). Both `tasks.md` 5.2 ("Argv: exactly
1 non-whitespace arg...; 0 or 2+ args → usage to stderr, exit 1") and `design.md` ADR-8 ("more than one
argument → error to stderr, exit code 1") describe the old, pre-fix contract, and task 5.2 remains
checked `[x]` even though the shipped behavior is now different from its own text. Functionally this is
a real, verified bugfix (the tool previously hardcoded the Production overlay only and silently used the
wrong pepper under Development) and does not violate any spec.md requirement — spec.md never mandates a
specific argv shape, only that the printed hash is application-compatible, which now holds more reliably
than before. No action required beyond noting that `tasks.md` 5.2's description text is stale relative
to the code it's checked against.

> **Resolved at archive time (2026-08-05):** `tasks.md` task 5.2 and `design.md` ADR-8 corrected to
> describe the shipped `Program.cs` behavior (optional `[environment]` arg, `ASPNETCORE_ENVIRONMENT`
> fallback, Development/Production overlay linking, layer reporting, pepper-refusal check) — surgical
> edits only, no source code touched. See the archived `tasks.md`/`design.md` in this folder for the
> corrected text.

## Result Contract

- status: done
- executive_summary: 0 CRITICAL, 1 WARNING, 1 SUGGESTION — implementation matches spec.md and tasks.md; all legacy hashing paths genuinely removed, Argon2id wired end-to-end, E2E/console tool parity verified by file-level cross-reference; one config-file diff in the E2E project needs the user's explicit sign-off on scope, one stale task description noted.
- artifacts: sdd/argon2id-password-hashing/verify-report (engram), openspec/changes/argon2id-password-hashing/verify-report.md
- next_recommended: sdd-archive (pending user confirmation on W1)
- risks: W1 (appsettings.Tests.json diff scope needs explicit user sign-off, low technical risk) — RESOLVED at archive time, see note above
- skill_resolution: none
