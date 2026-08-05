# Archive Report: argon2id-password-hashing

Date: 2026-08-05
Branch: `feat/argon2id-password-hashing` (6 commits, pushed to origin, commits-only delivery — no PR)
Artifact store mode: `hybrid`

## Source artifacts (traceability)

| Artifact | Engram observation | Filesystem (pre-archive) |
|---|---|---|
| proposal | `sdd/argon2id-password-hashing/proposal` — #1910 | `openspec/changes/argon2id-password-hashing/proposal.md` |
| spec (delta) | `sdd/argon2id-password-hashing/spec` — #1911 | `openspec/changes/argon2id-password-hashing/specs/password-hashing/spec.md` |
| design | `sdd/argon2id-password-hashing/design` — #1912 | `openspec/changes/argon2id-password-hashing/design.md` |
| tasks | `sdd/argon2id-password-hashing/tasks` — #1915 | `openspec/changes/argon2id-password-hashing/tasks.md` |
| verify-report | `sdd/argon2id-password-hashing/verify-report` — #1921 | `openspec/changes/argon2id-password-hashing/verify-report.md` |
| decision record (referenced throughout design/spec/tasks) | `sdd/argon2id-password-hashing/decisions` — #1909 | not a standalone file; superseded ADR-2/ADR-4/§4/§7/ADR-8 in `design.md` |

`explore.md` was also present on disk (`openspec/changes/argon2id-password-hashing/explore.md`) and is copied
into the archive folder for completeness, though it is not one of the five required SDD artifacts.

## What was verified before archiving

`sdd-verify` (#1921) returned **PASS — 0 CRITICAL, 1 WARNING, 1 SUGGESTION**. Both were resolved at archive
time with no source code change:

- **W1** (`appsettings.Tests.json` also differs, not just `DbTestHelpers.cs`) — **accepted, not a violation.**
  `CLAUDE.md`'s non-negotiable rule protects existing E2E *tests* (behavior, assertions, skip state), not
  configuration files. `appsettings.Tests.json` is configuration data; the edit was mandatory because the
  `Iterations` field it previously carried no longer exists on `AuthenticationSettings`. It was explicitly
  planned in `tasks.md` task 1.4 (Phase 1) and listed in decision #1909's own scope. Recorded as accepted
  scope in the archived `verify-report.md`.
- **S1** (doc drift — console tool arg contract) — **corrected.** `tasks.md` task 5.2 and `design.md` ADR-8
  described the console tool's original draft shape (exactly 1 argument, hardcoded `Production` overlay).
  The shipped code (`backend/src/SMCA.PasswordHasher/Program.cs`, commit `8df2659`, read in full at archive
  time) takes an optional second `[environment]` argument, falls back to `ASPNETCORE_ENVIRONMENT` then to
  `Production`, links whichever `appsettings.{environment}.json` overlay resolves, reports on stderr which
  layer was applied, and refuses to hash (exit 1) when no `Authentication:Pepper` resolves. Both `tasks.md`
  5.2 and `design.md` ADR-8 (Composition/Arguments/Output-contract subsections) were corrected — surgical
  edits, marked as "as shipped, commit `8df2659`, supersedes the draft below" with the original draft text
  preserved inline for history, mirroring the house style already used for decision #1909's ADR-2/ADR-4
  supersession banners. **No file under `backend/` was touched by this phase.**

## User-run verification (outside this agent — this agent never runs `dotnet`)

- `dotnet build backend/src/SMCA.sln` — PASS
- `dotnet test backend/src/Application.Tests/Application.Tests.csproj` — PASS
- `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` — PASS
- `dotnet run --project backend/src/SMCA.PasswordHasher -- "<password>"` — ran, produced
  `$argon2id$v=19$m=65536,t=3,p=2$df7wfdeYzyL1w1UzyZlozg$feDBN4XvRAfzO/peZiyCWl2eh7FnVDdxJogjFY5yH64`,
  confirming Argon2id v19, memory 64 MiB, time cost 3, parallelism 2, 16-byte salt, 32-byte hash at
  runtime — matches the production values in `appsettings.json`.

`tasks.md` Phase 6 (6.1–6.4) marked `[x]` in the archived copy to reflect this — all were `BLOCKED ON USER`
in the working copy and have since been run by the user with all passing.

## Spec merge (openspec/hybrid mode)

`openspec/specs/password-hashing/spec.md` did not exist before this change (new capability, confirmed by
`Glob` over `openspec/specs/**` returning no `password-hashing` entry). The delta spec at
`openspec/changes/argon2id-password-hashing/specs/password-hashing/spec.md` **is** the full spec, per the
skill's "If Main Spec Does Not Exist" rule — copied verbatim (no merge needed) to
`openspec/specs/password-hashing/spec.md`. 9 requirements, 0 modified/removed (none existed to modify).

| Domain | Action | Details |
|--------|--------|---------|
| password-hashing | Created | 9 requirements copied verbatim (new capability, no prior spec) |

## Archive contents

Written to `openspec/changes/archive/2026-08-05-argon2id-password-hashing/`:
- `explore.md` ✅ (verbatim copy)
- `proposal.md` ✅ (verbatim copy, with an appended archive-time note pointing to the superseding decision)
- `specs/password-hashing/spec.md` ✅ (verbatim copy)
- `design.md` ✅ (S1-corrected copy — ADR-8 Composition/Arguments/Output-contract sections updated to match
  shipped `Program.cs`; §10 "Follow-up flagged at archive time" appended documenting the stale
  `docs/backend/argon2id-password-hashing-migration.md` sections, see below)
- `tasks.md` ✅ (S1-corrected copy — task 5.2 updated to match shipped `Program.cs`; Phase 6 checked off
  reflecting user-run verification)
- `verify-report.md` ✅ (verbatim copy with archive-time resolution notes appended under W1 and S1)
- `archive-report.md` ✅ (this file)

## ⚠️ Tooling limitation — folder move incomplete

This `sdd-archive` execution had access to `Read`, `Edit`, `Write`, `Glob`, and the Engram MCP tools only —
**no shell/delete tool was available in this session.** All archive content above was created by writing new
files to `openspec/changes/archive/2026-08-05-argon2id-password-hashing/`; the source directory
`openspec/changes/argon2id-password-hashing/` (containing the pre-correction `tasks.md`/`design.md`,
`proposal.md`, `explore.md`, `verify-report.md`, and `specs/password-hashing/spec.md`) **still exists on disk
and was not deleted.**

**Action required before/at commit time**: the orchestrator or the user must remove the source directory,
e.g. `git rm -r openspec/changes/argon2id-password-hashing/`, so the change is not duplicated between the
active `openspec/changes/` tree and `openspec/changes/archive/`. Nothing under `backend/` is affected by this
limitation — it is purely an `openspec/` bookkeeping cleanup.

## Known open items (out of scope, recorded for traceability)

1. **Seeded `admin` account still holds a raw-SHA256 password.** `backend/src/Infrastructure/Persistence/EntityConfigurations/UserEntityTypeConfiguration.cs:40-44` was zero-diff throughout this change (confirmed by `sdd-verify`, #1921) — explicitly out of scope by decision #1909 and `specs/password-hashing/spec.md`'s Non-Goals. Consequence: the seeded `admin` account cannot log in until the user runs
   `dotnet run --project backend/src/SMCA.PasswordHasher -- "<password>" <environment>` and then
   `UPDATE "User" SET "Password" = '<hash>' WHERE "Login" = 'admin';` himself.
2. **`docs/backend/argon2id-password-hashing-migration.md` is stale** in three places, not edited by this
   phase (documentation-only follow-up, no code involved):
   - §6 (pepper): still proposes relocating the pepper out of `appsettings.json`; the final decision (#1909)
     keeps it there.
   - §8: claims no seeded SHA256 hashes exist; false — see the `admin` account above.
   - §11: all three "pending decisions" listed there are now decided (#1909).

## Result Contract

- status: done
- executive_summary: `argon2id-password-hashing` is archived and closed — spec merged as a new `password-hashing` capability into `openspec/specs/`, change artifacts copied to `openspec/changes/archive/2026-08-05-argon2id-password-hashing/` with the two verify-report follow-ups resolved (W1 accepted as config-not-test, S1 corrected in tasks.md/design.md to match shipped `Program.cs`), 0 CRITICAL throughout.
- artifacts:
  - Engram: `sdd/argon2id-password-hashing/archive-report`
  - `openspec/specs/password-hashing/spec.md` (new)
  - `openspec/changes/archive/2026-08-05-argon2id-password-hashing/{explore,proposal,design,tasks,verify-report,archive-report}.md`
  - `openspec/changes/archive/2026-08-05-argon2id-password-hashing/specs/password-hashing/spec.md`
- next_recommended: none — change is complete. Optional unrelated follow-ups: (a) regenerate the seeded `admin` password hash, (b) refresh `docs/backend/argon2id-password-hashing-migration.md` §6/§8/§11.
- risks:
  - Source directory `openspec/changes/argon2id-password-hashing/` was not deleted (no delete/shell tool available to this phase) — needs `git rm -r` before/at commit to avoid duplication with the archive copy.
  - Seeded `admin` account cannot log in until the user manually regenerates its hash (accepted, tracked, not a defect).
  - `docs/backend/argon2id-password-hashing-migration.md` §6/§8/§11 are stale (documentation-only, flagged, not fixed).
- skill_resolution: none
