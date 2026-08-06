# Archive Report: offline-password-verifier

Date: 2026-08-06
Branch: `feat/offline-password-verifier` (9 commits, `274e85b`..`7d76ef1`, pushed to origin, commits-only delivery — no PR)
Artifact store mode: `hybrid`

## Source artifacts (traceability)

| Artifact | Engram observation | Filesystem (pre-archive) |
|---|---|---|
| explore | `sdd/offline-password-verifier/explore` — #1935 | `openspec/changes/offline-password-verifier/explore.md` |
| proposal | `sdd/offline-password-verifier/proposal` — #1939 | `openspec/changes/offline-password-verifier/proposal.md` |
| spec (3 deltas) | `sdd/offline-password-verifier/spec` — #1940 | `openspec/changes/offline-password-verifier/specs/{offline-auth,offline-auth-mode,offline-roster-bundle}/spec.md` |
| design | `sdd/offline-password-verifier/design` — #1942 | `openspec/changes/offline-password-verifier/design.md` |
| tasks | `sdd/offline-password-verifier/tasks` — #1944 | `openspec/changes/offline-password-verifier/tasks.md` |
| verify-report | `sdd/offline-password-verifier/verify-report` — #1950 | `openspec/changes/offline-password-verifier/verify-report.md` |

## What this change fixed

**Two defects, not one.** The offline login verifier (`OfflineVerifierService`) and the DEK wrap
(`StoreKeyWrapService`) both derived key material from `User.Password` (the Argon2id PHC string)
while the client derived both from `Base64(SHA256(typedPassword))`. They agreed only under the
legacy raw-SHA256 format that predates Argon2id — so both offline login and offline data unlock
were broken for every bcrypt-then-Argon2id user, and totally broken after the Argon2id migration
(`4126b35`, archived 2026-08-05).

**Why no existing test caught it**: `ExportOfflineRosterTests` read the hash straight from the
database and fed it to a local helper mirroring `WrapDek` line for line — validating the backend
against itself and never exercising the client's convention. This change's structural answer is
the cross-stack known-answer-test (KAT) vector at `docs/contracts/offline-roster-dek-kat.json`,
now asserted independently on both the .NET (`StoreKeyWrapInteropTests.cs`) and the TypeScript
(`dek-unwrap.kat.test.ts`) side — each stack computes `Base64(SHA256(UTF8(vector.password)))`
itself and checks it against the vector's `passwordPreHash` field. Neither side can drift silently
again without the other catching it.

## What was verified before archiving

`sdd-verify` (#1950) returned **PASS WITH WARNINGS — 0 CRITICAL, 1 WARNING, 0 SUGGESTION**. The
single WARNING (`tasks.md` items `1.7` and `9.2` showing `[ ]` despite being complete — pure
documentation drift, no code impact) was corrected in place before this archive run: both items
read `[x]` in the working copy at archive time (confirmed by direct read), and the archived copy of
`tasks.md` in this folder carries that correction. No source code was touched to resolve it.

## User-run verification (outside this agent — this agent never runs `dotnet`)

- `dotnet build backend/src/SMCA.sln` — 0 errors
- `dotnet test backend/src/Application.Tests/Application.Tests.csproj` — 318/318 passed
- `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` — 305/305 passed
- `npx turbo run test --force` (frontend) — 2375 tests / 179 files, 0 cached, 0 failed

## Spec merge (openspec/hybrid mode)

All three delta specs targeted **existing** main specs (`offline-auth`, `offline-auth-mode`,
`offline-roster-bundle` all pre-existed under `openspec/specs/`) — no new capability was created.

| Domain | Action | Details |
|--------|--------|---------|
| `offline-auth` | Modified | R3, R11, R12, R17, R18 fully replaced with the delta's corrected text (key material = persisted `User.OfflinePasswordPreHash`, not `User.Password`); R5 merged additively (nullable-`Verifier` note + 2 new scenarios inserted, the pre-existing, orthogonal "Billing snapshot populated per user" scenario preserved, "Wrap fields populated in version 3" scenario superseded by the more precise new pre-hash scenario); R20-R23 appended as new requirements. Header date, checklist, "Related Specifications"/"Implementation Status" sections updated. |
| `offline-auth-mode` | Modified | 1 new requirement ("A roster user with a null verifier degrades to OfflineVerifierError") inserted between the existing error-mapping and billing-defaults requirements; "Verification Status" section appended with an addendum note. |
| `offline-roster-bundle` | Modified | "Bundle carries optional per-user wrap fields; formatVersion stays a plain number" merged additively — original wrappedDek/wrapSalt/wrapIv/formatVersion description and its v1/v2 scenarios preserved verbatim, new nullable-`verifier` sentence and 2 new v3 scenarios appended (matching the doc's existing v1→v2→v3 evolutionary style). 1 new requirement ("Genuine cross-stack DEK-wrap known-answer vector") appended. "Verification Status" section appended with an addendum note. |

### Contradiction resolved (per launch instructions)

Before this merge, `offline-auth/spec.md:78` (old R3) said the verifier's password input was
`User.Password` (a legacy-SHA256-only claim), while `offline-roster-bundle/spec.md:13-18` already
correctly documented the pre-hash convention (`Base64(SHA256(password))`). The merge resolved this
**in favor of the pre-hash convention**: every occurrence of `User.Password`/`storedPasswordHash`
as the key-derivation input inside `offline-auth`'s R3/R11/R12/R17/R18 was replaced with
`User.OfflinePasswordPreHash`/`preHash`. Verified by re-reading the merged file in full — the only
remaining `User.Password` mentions are intentional negative-comparison references (R3's "does NOT
match one seeded from `User.Password`" scenario, R17's historical "(Previously: ...)" note, R21's
NoTracking implementation note citing `UpdateUserPasswordCommand.cs:64` as the existing pattern).
No stale legacy-SHA256-as-`User.Password` wording remains anywhere in the merged spec.

## Archive contents

Written to `openspec/changes/archive/2026-08-06-offline-password-verifier/`:
- `explore.md` ✅ (verbatim copy)
- `proposal.md` ✅ (verbatim copy; Success Criteria checkboxes marked `[x]` with an appended archive-time note — all five confirmed by `sdd-verify`)
- `specs/offline-auth/spec.md` ✅ (verbatim delta copy, Verification Criteria checkboxes marked `[x]` with an appended archive-time note)
- `specs/offline-auth-mode/spec.md` ✅ (verbatim delta copy, appended archive-time note)
- `specs/offline-roster-bundle/spec.md` ✅ (verbatim delta copy, appended archive-time note)
- `design.md` ✅ (verbatim copy; D5 and Open Questions sections carry an appended archive-time note — migration committed as `7d76ef1`, open questions left genuinely open, not resolved)
- `tasks.md` ✅ (verbatim copy — already had `1.7`/`9.2` checked off before this archive run)
- `verify-report.md` ✅ (verbatim copy with an archive-time resolution note appended under the WARNING and Final Verdict)
- `archive-report.md` ✅ (this file)

## ⚠️ Tooling limitation — folder move incomplete

This `sdd-archive` execution had access to `Read`, `Edit`, `Write`, `Glob`, and the Engram MCP tools
only — **no shell/delete tool was available in this session**, matching the same constraint recorded
in the `2026-08-05-argon2id-password-hashing` archive report. All archive content above was created
by writing new files to `openspec/changes/archive/2026-08-06-offline-password-verifier/`; the source
directory `openspec/changes/offline-password-verifier/` (containing the pre-archive `proposal.md`,
`explore.md`, `design.md`, `tasks.md`, `verify-report.md`, and `specs/{offline-auth,offline-auth-mode,offline-roster-bundle}/spec.md`)
**still exists on disk and was not deleted.**

**Action required before/at commit time**: the orchestrator or the user must remove the source
directory, e.g. `git rm -r openspec/changes/offline-password-verifier/`, so the change is not
duplicated between the active `openspec/changes/` tree and `openspec/changes/archive/`. Nothing
under `backend/` or `frontend-react/` is affected by this limitation — it is purely an `openspec/`
bookkeeping cleanup.

## Known open items (out of scope, recorded for traceability)

1. **Uncommitted `RefreshToken` on login.** `LoginCommandHandler.cs:58` adds a `RefreshToken` that
   nothing ever commits — the login pipeline never calls `SaveChanges` because
   `UnitOfWorkBehaviour.IsQuery()` hard-returns `true` (`UnitOfWorkBehaviour.cs:20-21,36-40`), and no
   E2E test covers refresh tokens at all. Likely a live, pre-existing bug — flagged in both the
   exploration and the design's Open Questions, explicitly out of scope for this change. This
   change's own backfill (D3) deliberately avoided the same trap by using `ExecuteUpdateAsync`
   instead of relying on `SaveChanges`.
2. **No re-derivation path for `StoreEncryption:MasterSecret` rotation.** Rotating the master
   secret invalidates every stored `OfflinePasswordPreHash` (the plaintext that produced it is
   gone); recovery is "every user logs in online once" — the same failure mode the DEK already has
   today. Not fixed here; recorded as an accepted limitation.
3. **Seeded `admin` account has a null pre-hash by design.** `UserEntityTypeConfiguration.cs:40-44`'s
   `HasData`-seeded admin is intentionally left with `OfflinePasswordPreHash: null` (a hardcoded
   pre-hash would ship a password oracle in source). Consequence: that account gains offline access
   only after its first online login post-deploy — an explicit, documented trade-off (R21), not a
   defect.
4. **Two pre-existing, previously-unmigrated model drifts were swept into the migration.** The
   `RefreshTokens` table (entity existed since commit `42deff4`, never had a migration) and a
   `DueSoonDays` `SystemConfiguration` seed row (already had `HasData` on `main`, never had a
   migration row) both surfaced when EF scaffolded this change's migration. Both were confirmed
   genuine pre-existing drift, not scope creep introduced by this change, and the migration was
   named `Add-OfflinePasswordPreHash-RefreshTokens-And-DueSoonDays` to state them rather than hide
   them. Committed as `7d76ef1`.

## Result Contract

- status: done
- executive_summary: `offline-password-verifier` is archived and closed — the three delta specs (`offline-auth`, `offline-auth-mode`, `offline-roster-bundle`) are merged into `openspec/specs/`, resolving the pre-existing contradiction on the verifier/KEK derivation input in favor of the pre-hash convention with no stale legacy-SHA256 wording left behind; change artifacts copied to `openspec/changes/archive/2026-08-06-offline-password-verifier/` with the verify-report's one WARNING (tasks.md checkbox staleness) already resolved, 0 CRITICAL throughout.
- artifacts:
  - Engram: `sdd/offline-password-verifier/archive-report`
  - `openspec/specs/offline-auth/spec.md` (merged: R3/R5/R11/R12/R17/R18 corrected, R20-R23 added)
  - `openspec/specs/offline-auth-mode/spec.md` (merged: 1 requirement added)
  - `openspec/specs/offline-roster-bundle/spec.md` (merged: 1 requirement modified additively, 1 requirement added)
  - `openspec/changes/archive/2026-08-06-offline-password-verifier/{explore,proposal,design,tasks,verify-report,archive-report}.md`
  - `openspec/changes/archive/2026-08-06-offline-password-verifier/specs/{offline-auth,offline-auth-mode,offline-roster-bundle}/spec.md`
- next_recommended: none — change is complete. No follow-up SDD change is required; the three "Known open items" above are recorded, accepted limitations, not defects needing a new change.
- risks:
  - Source directory `openspec/changes/offline-password-verifier/` was not deleted (no delete/shell tool available to this phase) — needs `git rm -r` before/at commit to avoid duplication with the archive copy.
  - `LoginCommandHandler.cs:58`'s uncommitted `RefreshToken` remains a live, unaddressed, pre-existing possible bug outside this change's scope.
  - `StoreEncryption:MasterSecret` rotation has no re-derivation path for `OfflinePasswordPreHash` (accepted, tracked, not a defect — same failure mode as the existing DEK).
- skill_resolution: none
