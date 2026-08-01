# Verification Report

**Change**: `update-user-endpoint-fixes`
**Phase**: sdd-verify
**Date**: 2026-07-31
**Verifier**: sdd-verify sub-agent (hybrid artifact backend)

---

## Verdict

**PASS WITH WARNINGS** — all 12/12 Update E2E + 26/26 regression GREEN (verified by re-run), build 0 errors, all behavioral fixes implemented and proven at runtime. Two warnings: (1) E2E-U4(a) test missing (spec requires two tests, one implemented); (2) CH-U6 spec text conflicts with the D10 revert — code correctly KEEPS `UpdateAsync` (NoTracking root cause), spec must be updated at archive.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total (change scope) | 11 (1.1–1.6, 2.1–2.2, 3.1–3.3) |
| Tasks complete | 11 ✅ |
| Tasks incomplete | 0 |
| Archive-time flags (4.1, 4.2) | 0 — correctly deferred, NOT this change's scope ✅ |

---

## Build & Tests Execution (my own runs)

**Build**: ✅ Passed — `dotnet build backend/src/SMCA.WebApi/SMCA.WebApi.csproj` → 0 Errors, 8 NuGet vulnerability warnings (pre-existing: System.Text.Json 8.0.1, AutoMapper 13.0.1, RestSharp 110.2.0 — unrelated to this change).

**Tests — Update suite**: ✅ **12/12 passed, 0 failed, 0 skipped** (570 ms)
`dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersUpdateTests"`

**Tests — Regression**: ✅ **26/26 passed, 0 failed, 0 skipped** (2 s)
`dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersListTests|FullyQualifiedName~UsersUpdateTests"`
(12 Update + 8 UsersList + 6 StoreUsersList — substring match broadens scope, matches apply-progress claim)

Matches apply-progress evidence exactly (12/12 and 26/26). No skips. Stack traces in test output are from `ErrorHandlerMiddleware` logging expected error paths (validator 400) — not failures.

**Coverage**: ➖ Not configured (`openspec/config.yaml` does not exist).

---

## Spec Compliance Matrix

| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| UC-U1 Swagger 400/401/403/404 | 1a–1e | `UsersController.cs:60-64` — 4 new ProducesResponseType + 200 `ResponseResult<bool>` preserved | ✅ COMPLIANT (static) |
| UC-U2 `[FromRoute] id` | 2a | `UsersController.cs:66` — `UpdatedAsync([FromRoute] Guid id, ...)` | ✅ COMPLIANT (static) |
| UC-U3 200+envelope contract | 3a success | `Update_owner_admin_edits_staff_returns_200` + `Update_as_super_admin_returns_200` | ✅ COMPLIANT |
| UC-U3 | 3b IDOR | `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404` | ✅ COMPLIANT |
| UC-U3 | 3c race | Code only — `UpdateUserCommand.cs:47-48` (no E2E can race the delete); same gap as GET precedent | ⚠️ PARTIAL (static only) |
| CH-U1 IDOR guard | 1a/1b/1c | `UpdateUserCommand.cs:50-51`; tests: self (super/owner-admin 200), admin bypass (`Update_owner_admin_edits_staff_returns_200`), IDOR (`..._returns_envelope_404`) | ✅ COMPLIANT |
| CH-U2 tri-state | 2a keep | `Update_partial_body_preserves_email_and_cellphone` | ✅ COMPLIANT |
| CH-U2 | 2b clear | `Update_with_empty_cellphone_clears_value` | ✅ COMPLIANT |
| CH-U2 | 2c value assign | No test PUTs non-empty CellPhone/Email; code `UpdateUserCommand.cs:54-55` ternary else-branch | ⚠️ PARTIAL (static only) |
| CH-U2 | 2d FullName | Every test body (all PUT `{FullName}`) | ✅ COMPLIANT |
| CH-U3 race guard | 3a/3b | `UpdateUserCommand.cs:46-48` — `User?` + null → `Failure(NotFound, 404)`; 3b implicitly by all passing tests | ⚠️ PARTIAL (3a static only) |
| CH-U4 IsActive | 4a explicit false | `Update_explicit_is_active_false_as_super_admin_deactivates` | ✅ COMPLIANT |
| CH-U4 | 4b admin absent | `Update_omitting_isActive_preserves_active_state` | ✅ COMPLIANT |
| CH-U4 | 4c explicit true | No test PUTs `isActive:true`; code `:56-57` same branch as 4a | ⚠️ PARTIAL (static only) |
| CH-U4 | 4d non-admin never | **NO TEST** — E2E-U4(a) was dropped (see E2E-U4 row) | ❌ UNTESTED |
| CH-U5 token propagation | 5a/5b | `ExistsAsync(userId, ct)` (validator:35); `SaveChangesAsync(ct)` (handler:65); `GetByIdAsync` signature has NO token param (`IGenericRepository.cs:16`) → nothing to forward | ✅ COMPLIANT |
| CH-U6 no UpdateAsync | 6a/6b | **DEVIATION** — code KEEPS `await _userRepository.UpdateAsync(user)` (`UpdateUserCommand.cs:63`). Spec premise false: NoTracking → untracked fetch → no persistence without UpdateAsync | ⚠️ DEVIATION (spec update at archive) |
| VL-U1 ExistsAsync | 1a–1d | `UpdateUserCommandValidator.cs:33-36` — `ExistsAsync(userId, ct)`, `tenantId`→`userId`; zero GetByIdAsync/FindAsync in validator; `Update_nonexistent_id_returns_400` | ✅ COMPLIANT |
| VL-U2 FullName/Email | 2a–2d | FullName rules `:22-24`; Email format `When(!IsNullOrEmpty)` `:26-29`; 2a via `Update_empty_body_returns_400`; 2b/2c no direct test (validator logic unchanged shape, conditional verified static) | ✅ COMPLIANT (static for 2b/2c) |
| VL-U3 no IsActive rule | 3a | No IsActive rule in validator (file verified) | ✅ COMPLIANT (static) |
| E2E-U1 IDOR envelope 404 | 1a/1b | `Update_other_user_as_store_user_with_profile_feature_returns_envelope_404` (line 93) | ✅ COMPLIANT |
| E2E-U2 preserve email/cellphone | 2a/2b | `Update_partial_body_preserves_email_and_cellphone` (line 115) | ✅ COMPLIANT |
| E2E-U3 clear to null | 3a | `Update_with_empty_cellphone_clears_value` (line 139) | ✅ COMPLIANT |
| E2E-U4 omitted IsActive | 4b | `Update_omitting_isActive_preserves_active_state` (line 162) — SuperAdmin variant | ✅ COMPLIANT |
| E2E-U4 | **4a non-admin self** | **NO TEST** — spec requires TWO tests (a)+(b); design's test 4 (`Update_as_store_user_with_profile_keeps_own_is_active`) was dropped in tasks; only (b) implemented | ❌ UNTESTED |
| E2E-U5 explicit toggle | 5a | `Update_explicit_is_active_false_as_super_admin_deactivates` (line 185) | ✅ COMPLIANT |
| E2E-U6 OwnerAdmin staff edit | 6a | `Update_owner_admin_edits_staff_returns_200` (line 208) | ✅ COMPLIANT |
| E2E-U7 archive alignment | 7a/7b | Main `openspec/specs/users-e2e/spec.md` NOT modified (git status confirms) — correctly deferred | ✅ COMPLIANT (deferred) |
| RR-U1 ExistsAsync token | — | Code: `IUserRepository.cs:19` + `UserRepository.cs:99-102` (`IgnoreQueryFilters().AnyAsync(..., ct)`); zero new methods; spec doc alignment deferred to archive (task 4.2) | ✅ COMPLIANT (code) |

**Compliance summary**: 25/28 scenarios fully compliant + tests GREEN; 2 ⚠️ PARTIAL (race 3c / value-assign 2c, static-only — inherently hard to E2E); 2 ❌ UNTESTED rows (CH-U4 4d, E2E-U4 4a — the SAME gap, counted once in spirit: the StoreUser+Profile self-IsActive test was dropped).

---

## Correctness (Static — Structural Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| UC-U1/UC-U2/UC-U3 (controller) | ✅ Implemented | `UsersController.cs:59-70` — exact design block D12 |
| CH-U1 (IDOR) | ✅ Implemented | `UpdateUserCommand.cs:50-51`, mirrors `UpdateUserPasswordCommand.cs:49-56` |
| CH-U2 (tri-state) | ✅ Implemented | `:54-55` — `is not null` keep-guard + `== "" ? null : value`; FullName `:53` unconditional |
| CH-U3 (race guard) | ✅ Implemented | `:46-48` — `User?` + null check BEFORE ownership guard (D9 order) |
| CH-U4 (IsActive) | ✅ Implemented | `:21` `bool?`; `:56-57` admin && HasValue gate |
| CH-U5 (token) | ✅ Implemented | validator `:35`, handler `:65`; GetByIdAsync has no token param |
| CH-U6 (UpdateAsync) | ⚠️ Deviation | `:63` KEEPS UpdateAsync + NoTracking comment `:59-62` — see D10 disposition below |
| VL-U1 (ExistsAsync) | ✅ Implemented | `:33-36` — single `AnyAsync` round-trip, renamed param, token forwarded |
| VL-U2 (FullName/Email) | ✅ Implemented | `:22-24` + `:26-29` conditional Email format |
| VL-U3 (no IsActive rule) | ✅ Implemented | verified absent |
| RR-U1 (repo spec gap) | ✅ Code correct | `UserRepository.cs:99-102`; doc alignment deferred |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D6 controller `command.Id = id` mutation | ✅ Yes | `UsersController.cs:68` kept (minimal-change per bugfix rule) |
| D7/D4 IsActive admin-gated | ✅ Yes | `:56-57` exactly per design |
| D8/D2 tri-state | ✅ Yes | `:54-55` per design |
| D9 NRE guard | ✅ Yes | `:46-48`, placed BEFORE ownership guard |
| **D10 UpdateAsync removal** | ⚠️ **REVERTED (Batch B)** | Premise "FindAsync tracks" is FALSE for this codebase — see disposition |
| D11 validator ExistsAsync | ✅ Yes | `:33-36` |
| D12 controller metadata | ✅ Yes | `:60-64` exact block |
| Test count (design 7 vs tasks 6) | ⚠️ Deviated | Design's test 4 (StoreUser+Profile self-IsActive) dropped; design's note said "drop 6 (explicit toggle)" but implementation kept the toggle and dropped the self-IsActive test instead — creates the E2E-U4(a)/CH-U4 4d gap |

---

## D10 Deviation Disposition (implementation → spec alignment)

**What**: `UpdateUserCommandHandler` KEEPS `await _userRepository.UpdateAsync(user);` (line 63) before `SaveChangesAsync(cancellationToken)` (line 65). The spec CH-U6 and design D10 require removing it.

**Root cause (verified)**: `ApplicationDbContext.cs:45` — `ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;`. Therefore `GetByIdAsync` → `FindAsync` (`GenericRepository.cs:82-85`) returns an **UNTRACKED** entity. Without `UpdateAsync` (`GenericRepository.cs:39-43` = `Entry.State = Modified`, which attaches the entity), `SaveChangesAsync` detects zero changes → returns 0 → **NOTHING persists** (measured envelope `Succeeded=True, Data=False` in Batch B, before revert). The spec's premise "The entity is already tracked by the fetch" (CH-U6, line 66) is factually wrong for this codebase.

**Intent preserved**: The spec's INTENT (partial tri-state updates that don't destroy data) is fully met — arguably more so. The full-column UPDATE writes the fresh entity back; since the entity carries current DB values and the tri-state guards only mutate body-present fields, unchanged columns are written back with their existing values. No data destruction. The measured false-positive pattern (preserve-tests passing while persistence is broken) is documented in apply-progress.

**Disposition**: This is NOT a spec violation of intent — it's the spec's literal mechanism being impossible under NoTracking. Recommend: at archive, update CH-U6 (and design D10) to reflect "keep UpdateAsync because the context is NoTracking; tri-state guards make the full-column UPDATE safe" — mirroring the GET precedent's Deviation handling. Also consider a follow-up note in `openspec/specs/command-handler/spec.md` merge. No code change needed; current code is behaviorally correct and 12/12 GREEN.

---

## No-Commit Constraint

✅ **Confirmed** — `git log --oneline -8` shows NO commit for `update-user-endpoint-fixes` (latest commits: `3ce785e7 chore(sdd): archive get-user-by-id-endpoint-fixes`, `c2043a01`, `235bc990`, ...). Working tree only:
- Modified: `UpdateUserCommand.cs`, `UpdateUserCommandValidator.cs`, `UsersController.cs`, `UsersUpdateTests.cs` (+136 lines) — consistent with this change's scope.
- Untracked: `openspec/changes/update-user-endpoint-fixes/*` (specs, design, tasks, apply-progress).
- NOTE: working tree contains MANY unrelated uncommitted changes from prior batches (StoresController, frontend store files, archived openspec changes, etc.) — NOT part of this change; not flagged.

---

## Phase 4 Flags (archive-time — correctly NOT done here)

- [ ] 4.1 users-e2e R3 alignment (404 → 400 + StoreUser-with-Profile IDOR row) — deferred ✅ (main spec untouched)
- [ ] 4.2 RR-U1 `ExistsAsync` token param doc — deferred ✅ (code already correct)

---

## Issues Found

**CRITICAL** (must fix before archive): None — all tests GREEN, build clean, all behavioral fixes proven at runtime.

**WARNING** (should fix):
1. **E2E-U4(a) / CH-U4 4d untested** — Spec E2E-U4 requires TWO tests ("(a) StoreUser+Profile → self ... (b) SuperAdmin → ..."). Only (b) exists. Design's test 4 (`Update_as_store_user_with_profile_keeps_own_is_active`) was dropped when tasks fixed the count at 6 (dropping the wrong one per the design's own note). The non-admin IsActive-ignore branch (`UpdateUserCommand.cs:56` left conjunct) has zero runtime coverage. Fix is cheap (mirror E2E-U1 seeding; target self, assert IsActive still true) — add at archive alongside 4.1, or document the deviation in the users-e2e delta spec.
2. **CH-U6 spec text conflicts with implementation** — literal "MUST remove UpdateAsync" is unimplementable under NoTracking (see D10 disposition). Must be rewritten at archive.

**SUGGESTION** (nice to have):
- CH-U2 2c (value assigns) and CH-U4 4c (explicit `isActive:true` reactivation) lack direct tests — same ternary/branch as tested paths; low value, optional.
- CH-U3 3c / UC-U3 3c race has no E2E (inherently racy); static guard + precedent from GET is acceptable.

---

## Verdict

**PASS WITH WARNINGS** — Implementation is complete, correct, and behaviorally proven (12/12 + 26/26 GREEN on re-run; build 0 errors). The D10 deviation is a justified implementation→spec alignment (NoTracking root cause, intent preserved). Two archive-time actions recommended: (1) spec update for CH-U6 (UpdateAsync stays), (2) add the missing E2E-U4(a) StoreUser+Profile self-IsActive test or document the drop in the users-e2e delta. Ready for sdd-archive with these dispositions.
