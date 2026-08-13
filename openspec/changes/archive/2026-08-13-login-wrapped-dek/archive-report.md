# Archive Report: login-wrapped-dek — Login Delivers Wrapped DEK to Every Authenticated User

**Change**: `login-wrapped-dek`
**Archived**: 2026-08-13
**Branch**: `feat/login-wrapped-dek`
**Artifact store**: hybrid (openspec filesystem + Engram)
**Archived to**: `openspec/changes/archive/2026-08-13-login-wrapped-dek/`
**Archive mode**: normal (no partial archive, no stale-checkbox reconciliation)

## Summary

Closed: the login response (`AuthDto`) now delivers the store DEK wrapped with the user's password pre-hash (`wrappedDek`/`wrapSalt`/`wrapIv`) to ANY authenticated user — no admin permission — byte-compatible with the offline-roster wrap and empty-on-failure. The DEK no longer leaves the backend only via the admin-only roster export; encryption is now independent of authentication mode. Roster export, Register, and Refresh are untouched.

## Requirements Delivered (final state, all COMPLIANT)

| Req | Delta action | Final rule | Evidence |
|-----|--------------|------------|----------|
| R1 | ADDED (new capability `auth-login-wrapped-dek`) | Login delivers wrapped store DEK to any authenticated user; no admin permission | `LoginCommandHandlerTests.Handle_WithValidCredentials_ShouldReturnWrappedDekFields` (unit) + `AuthLoginDekWrapTests.StoreUser_login_returns_wrapped_dek_byte_equal_to_GetDek` (E2E) |
| R2 | ADDED | KEK = `Unprotect(stored pre-hash envelope)`, never `User.Password`; byte-compatible with roster wrap | `AuthLoginDekWrapTests.StoreUser_…_byte_equal_to_GetDek` + `OwnerAdmin_…_byte_equal_to_GetDek` (E2E, real PostgreSQL) |
| R3 | ADDED | Wrap computed after pre-hash backfill; first login receives the key | `AuthLoginDekWrapTests.First_login_backfills_prehash_and_returns_wrapped_dek` (E2E) |
| R4 | ADDED | Any failure degrades to empty fields; login never fails; Register/Refresh stay empty | Unit: wrap-throw, null preHash, `Guid.Empty`, null-user facts; `RegisterCommandHandlerTests.Handle_ShouldReturnSuccess_WithEmptyWrapFields`; `RefreshCommandHandlerTests.Refresh_withValidToken_returnsEmptyWrapFields`; E2E SuperAdmin-empty + 401/403-no-data facts |
| e2e R1–R4 | ADDED (modified capability `auth-login-e2e`) | New `AuthLoginDekWrapTests.cs` (6 facts, new file only): byte-parity, first-login backfill, empty-on-no-store, no-key-on-failure, FK-safe cleanup | `AuthLoginDekWrapTests` 6/6 filtered (real PostgreSQL) |

## Final State (close-of-cycle, per Final-State Authority)

- **Apply**: 3 commits on `feat/login-wrapped-dek` — `aabb1b83` feat(auth) prod+unit, `7d97ed6a` test(e2e) new E2E file, `ea9e6ad4` test(auth) remediation (3 unit facts). Total measured changed lines: **640** (566 accepted apply + 74 test-only remediation). No existing E2E test or support file touched (`git show --stat` verified; roster files absent from all diffs).
- **Verify**: PASS — re-verify verdict after remediation: **13/13 scenarios, 8/8 requirements, 0 blockers**. Evidence revision `sha256:7ade4eee24cc317204516604897d1cb6162263b3b0c2ab2a7810083fd03828c0` (per `verify-report.md` and Engram #772).
- **Test evidence (final)**: `dotnet build backend/src/SMCA.sln` exit 0 (pre-existing NU1902/NU1903 only); unit **337/337** (330 baseline + 4 wrap facts + 3 remediation facts); E2E filtered `AuthLoginDekWrapTests` **6/6** (real PostgreSQL); full E2E **348/348** (no regression, roster suite `ExportOfflineRosterTests` green).
- **CRITICAL findings**: 0. **WARNING findings**: 0. SUGGESTION (1, optional hardening — post-cleanup row-count assertion): not required; cleanup helper is pre-existing, suite-proven infrastructure.
- **Tasks**: 12/12 complete; archived `tasks.md` has zero unchecked implementation tasks. (Proposal Success Criteria checkboxes remain unchecked per propose-phase convention — identical to the s2-03 archive precedent; not implementation tasks.)
- **Design decisions**: all followed — inline helper (roster precedent), `GetUserByIdIgnoreQueryFiltersAsync` re-query (NoTracking + `ExecuteUpdateAsync` stale-entity trap), `Unprotect` stored envelope, helper try/catch → warning + empty tuple, guard order user/preHash/`Guid.Empty`, 3 trailing optional `AuthDto` params default `""`, local E2E DTO + local `UnwrapDek` (210_000 iters), inline first-login seed helper, call site after `SaveChangesAsync`.
- **Out of scope (documented, pre-existing)**: roster export/format; frontend consumption (separate change); new services; DB changes; Register/Refresh behavior.

## Spec Sync (delta → main spec)

1. **`auth-login-wrapped-dek` (NEW capability)** — no main spec existed; delta spec IS a full spec. Copied mechanically (shell `Copy-Item` + `diff -r` byte-identity readback, empty output) to `openspec/specs/auth-login-wrapped-dek/spec.md`. 4 requirements / 7 scenarios.
2. **`auth-login-e2e` (modified capability)** — merged delta into `openspec/specs/auth-login-e2e/spec.md`: 4 ADDED requirements appended verbatim (`E2E — StoreUser and OwnerAdmin receive byte-compatible wraps`, `E2E — first-login backfill delivers the wrap`, `E2E — empty fields on no store; no key on failed logins`, `E2E — cleanup removes the seeded graph`), 6 scenarios. All pre-existing requirements (inactive-store 403, StoreUser roundtrip) and their scenarios preserved untouched. Header provenance extended (`Origin` + `Capability` lines) and delivery note added following the file's established `Delivery note` precedent.
3. No REMOVED/RENAMED/MODIFIED requirement blocks in either delta — no deletions performed. No destructive merge warning needed.

## Archive Move

Change folder moved to `openspec/changes/archive/2026-08-13-login-wrapped-dek/` via shell `Move-Item` (folder untracked — `git ls-files` empty, `git mv` not applicable; same as s2-03 precedent). Mandatory `diff -r` readback (pre-move recursive snapshot vs archived tree, using Git-for-Windows `diff.exe`): **empty output, exit 0 — byte-identical**. All 6 artifacts archived: `proposal.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `specs/auth-login-e2e/spec.md`, `specs/auth-login-wrapped-dek/spec.md`. Active `openspec/changes/` no longer lists the change.

## Engram Lineage (observation IDs)

Prior change observations read/verified this archive run (via Engram search + full retrieval): explore #765, proposal #767, spec #768, design #769, tasks #770, apply-progress #771, verify-report #772. This archive report persisted as topic `sdd/login-wrapped-dek/archive-report` (type architecture, capture_prompt false).

## Delivery

Commit-only on `feat/login-wrapped-dek` per session preflight — NO PR, NO push. Final archive commit stages only openspec planning/archive artifacts (`openspec/config.yaml`, archived change folder, synced `openspec/specs/` updates). Source/test files are NOT staged (already committed in `aabb1b83`, `7d97ed6a`, `ea9e6ad4`).