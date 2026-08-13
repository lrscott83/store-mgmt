# Apply Progress: Login Delivers Wrapped DEK to Every Authenticated User

**Change**: `login-wrapped-dek` — apply — 2026-08-13 — hybrid (file + engram `sdd/login-wrapped-dek/apply-progress`)
**Status**: success — all tasks complete (12/12)
**Mode**: Strict TDD (production/unit batch) + Standard additive E2E (project precedent)
**Branch**: `feat/login-wrapped-dek` (commit-only; NO PR, NO push)

## Commits Made

| Hash | Batch | Scope | Message |
|------|-------|-------|---------|
| `aabb1b83` | 1 (prod + unit) | `feat(auth)` | deliver wrapped store DEK on login |
| `7d97ed6a` | 2 (new E2E file) | `test(e2e)` | assert login delivers wrapped store DEK |
| `ea9e6ad4` | 3 (verify evidence-gap remediation, unit only) | `test(auth)` | assert empty wrap fields on register/refresh and null-user guard |

openspec planning artifacts (`openspec/changes/login-wrapped-dek/`, `openspec/config.yaml`) intentionally NOT committed — archive phase governs them (tasks.md does not instruct committing them).

## Tasks Completed / Remaining

All 12 implementation tasks complete (`1.1, 2.1, 2.2, 2.3, 3.1–3.7, 4.1–4.4, 5.1`). Remaining: none. Next phase: sdd-verify (fresh run to reach 13/13 scenario coverage).

## Remediation — Verify Evidence Gap (2026-08-13)

Verify run validated 12/13 spec scenarios; R4 ("Register and Refresh deliver no wrap") had zero explicit assertions and a null-user-guard suggestion was outstanding. Added 3 unit facts (no production code, no E2E files, no existing E2E tests touched):

| File | Fact |
|------|------|
| `RegisterCommandHandlerTests.cs` | `Handle_ShouldReturnSuccess_WithEmptyWrapFields` — success AuthDto carries `WrappedDek`/`WrapSalt`/`WrapIv` empty |
| `RefreshCommandHandlerTests.cs` | `Refresh_withValidToken_returnsEmptyWrapFields` — refresh success AuthDto carries all three empty |
| `LoginCommandHandlerTests.cs` | `Handle_WhenRequeriedUserIsNull_ShouldReturnEmptyFields` — `GetUserByIdIgnoreQueryFiltersAsync` → null ⇒ login succeeds, wrap fields empty (guard in `TryBuildLoginDekWrapAsync`) |

Suggestion (b) post-cleanup row-count assertion: skipped — pre-existing E2E cleanup patterns already assert deletion; not needed for scenario coverage.

## Test Evidence

| Check | Command | Result |
|-------|---------|--------|
| Safety net (pre-edit) | `dotnet test backend/src/Application.Tests/Application.Tests.csproj` | 330/330 passed |
| Batch 1 build | `dotnet build backend/src/SMCA.sln -v minimal` | Succeeded; only pre-existing NU1902/NU1903 + CS86xx warnings |
| Batch 1 unit | `dotnet test backend/src/Application.Tests/Application.Tests.csproj` | 334/334 passed (330 + 4 new) |
| Batch 2 E2E (filtered) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginDekWrapTests"` | 6/6 passed (real PostgreSQL localhost:5432, db smca_test) |
| Full solution (4.4) | `dotnet test backend/src/SMCA.sln` | Domain 22/22 · Application 334/334 · E2E 348/348 — existing suites green, roster (`ExportOfflineRosterTests`) untouched |
| Remediation build | `dotnet build backend/src/SMCA.sln -v minimal` | Succeeded; only pre-existing NU1902/NU1903 + CS86xx warnings (incl. pre-existing CS8620s in register/re-seller/roster tests shifted by edits) |
| Remediation unit | `dotnet test backend/src/Application.Tests/Application.Tests.csproj` | 337/337 passed (334 + 3 new) — zero warnings from the 3 new facts |

## TDD Cycle Evidence (Strict TDD — production/unit batch)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 AuthDto (+3 params) | `LoginCommandHandlerTests.cs` | Unit | ✅ 330/330 | ✅ Written (CS1061 WrappedDek/WrapSalt/WrapIv) | ✅ Params added | ➖ Single (structural DTO shape — no branching) | ➖ None needed |
| 2.1 RED tests (+4 mocks, ctor ext, +4 facts) | `LoginCommandHandlerTests.cs` | Unit | ✅ 330/330 | ✅ Written first (CS1729 ctor 11-args + CS1061) | ✅ Compiles + passes after GREEN | ✅ 4 cases: populated / wrap-throw / null preHash / Guid.Empty | ➖ None needed |
| 2.2 Handler ctor +4 deps + `TryBuildLoginDekWrapAsync` | `LoginCommand.cs` | Unit | ✅ 330/330 | (covered by 2.1 RED) | ✅ 334/334 | ✅ 3 degradation paths + success path | ➖ None needed (mirrors roster precedent) |
| 2.3 Call site after `SaveChangesAsync` + re-query | `LoginCommand.cs` | Unit | ✅ 330/330 | (covered by 2.1 RED) | ✅ 334/334 | ✅ covered by E2E first-login + byte-parity facts | ➖ None needed |

## Work Unit Evidence (All Modes)

### Unit 1 — AuthDto + handler wrap + unit tests (commit `aabb1b83`)

| Evidence | Required value |
|----------|----------------|
| Focused test command and exact result | `dotnet test backend/src/Application.Tests/Application.Tests.csproj` → Passed, 334/334 (4 new facts green) |
| Runtime harness command/scenario | N/A — mock-level slice; real wiring proven by Unit 2 (per tasks.md) |
| Rollback boundary | `git revert aabb1b83` — 3 files (AuthDto.cs, LoginCommand.cs, LoginCommandHandlerTests.cs); zero E2E impact |

### Unit 2 — New `AuthLoginDekWrapTests.cs` (commit `7d97ed6a`)

| Evidence | Required value |
|----------|----------------|
| Focused test command and exact result | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AuthLoginDekWrapTests"` → Passed, 6/6 |
| Runtime harness command/scenario | Real `POST /api/v1/auth/login` via WebAppFixture against PostgreSQL localhost:5432 db `smca_test` — all 6 facts exercised real HTTP + real DB (server log shows the 401 invalid-password and 403 no-active-store branches firing) |
| Rollback boundary | Delete `backend/src/SMCA.WebApi.E2ETests/Auth/AuthLoginDekWrapTests.cs` (or `git revert 7d97ed6a`) — no other file affected |

## Deviations from Design

- None material. `TryBuildLoginDekWrapAsync` signature matches design `(Guid userId, CancellationToken)`; the inner re-query uses `GetUserByIdIgnoreQueryFiltersAsync(string)` which takes no cancellation token, so the token param is unused for now (kept per design contract).
- E2E deserializes into local `LoginDekWrapData` (design-preferred) rather than `ApiResponse<AuthDto>`; failure facts assert `Data == null` (verified `ResponseResult<T>.Data` is null on failure).

## Risks

- `AuthDto` wire shape grew by 3 fields — additive/defaulted, so Register/Refresh and any JSON consumers ignore them; no DB change.
- Wrap derivation runs on every login (PBKDF2 210k iterations + AES-GCM) — CPU cost per login, same cost class as the roster path; not benchmarked separately.
- E2E byte-parity facts depend on the DB pre-hash envelope being unprotectable with the seeded user id — matches roster test pattern (`SuperAdmin_export_unwrappedDek_byteEqualsGetDek`).

## Key Learnings

1. The NoTracking + ExecuteUpdateAsync stale-entity trap made the filter-free re-query mandatory inside the login helper (CLAUDE.md gotcha confirmed live).
2. A local E2E response DTO plus a local UnwrapDek kept ExportOfflineRosterTests.cs and TestDtos.cs untouched while proving byte-parity.
3. Failure serialization of ResponseResult<T> leaves Data null, so "no AuthDto" is assertable as body.Data == null.
4. `User.SelectedStoreId` is a non-nullable Guid — SuperAdmin's unset value is Guid.Empty, which the guard handles without a nullability branch.
