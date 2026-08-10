# Apply Progress: b5-error-log-severity

Change: Business rejections log at Warning (message only); genuine faults keep Error with stack.
Status: **ALL TASKS COMPLETE — ready for verify**
Date: 2026-08-10
Mode: Strict TDD (E2E-only, hermetic). Delivery: single PR, size:exception not needed (~210 lines, 400-line budget risk Low).

## Summary

- **RED (Phase 1)**: New hermetic E2E file `backend/src/SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` (6 cases) run against the REAL `ErrorHandlerMiddleware` → **exactly 3 failed (R1 Validation, R2 ApiException 400, R3 ApiException 404 — Warning level expectations, found `LogLevel.Error`), 3 passed (R4×2 Error + R5 Debug pin current behavior)**. Current behavior pinned before any production edit.
- **GREEN (Phase 3)**: After the single production edit, same focused filter → **6/6 passed**.
- **Production edit (Phase 2)**: ONLY `ErrorHandlerMiddleware.cs:60-62` generic catch (user-authorized). `git diff` confirms exactly one production file, +4/-1.
- **Verification (Phase 4)**: Build 0 errors; no existing E2E test or support file touched; `git status --porcelain` clean except new test dir + modified middleware + openspec artifacts; pre-existing untracked `frontend-react/openspec/changes/offline-roster-login-actions/` untouched (unrelated).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.2 | `backend/src/SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` | E2E (hermetic, direct instantiation) | N/A (new file) | ✅ Written (file compiles, 0 build errors) | ✅ 6/6 after edit | ✅ 6 cases (R1–R5 incl. 2 error types + disconnect) | ✅ Clean (design D2 logger, D3 envelope helper) |
| 1.3 R1 ValidationException | same file | E2E | N/A | ✅ Written | ✅ | ✅ (R2/R3 vary status/code) | ➖ None needed |
| 1.4 R2 ApiException 400 | same file | E2E | N/A | ✅ Written | ✅ | ✅ | ➖ None needed |
| 1.5 R3 ApiException 404 | same file | E2E | N/A | ✅ Written | ✅ | ✅ | ➖ None needed |
| 1.6 R4 InvalidOperationException | same file | E2E | N/A | ✅ Written | ✅ | ✅ | ➖ None needed |
| 1.7 R4 KeyNotFoundException | same file | E2E | N/A | ✅ Written | ✅ | ✅ | ➖ None needed |
| 1.8 R5 BadHttpRequestException | same file | E2E | N/A | ✅ Written | ✅ | ✅ | ➖ None needed |
| 1.9 RED run | — | — | — | ✅ 3 failed / 3 passed (exactly R1–R3) | — | — | — |
| 2.1 Production edit | — | — | N/A | — | ✅ `git diff` +4/-1 single catch | — | ✅ Switch/serializer untouched |
| 2.2 Scope check | — | — | — | — | ✅ 1 production file only | — | — |
| 3.1 GREEN run | — | — | — | — | ✅ 6/6 passed | — | — |
| 3.2 Envelope stability | — | — | — | — | ✅ every case deserializes `ApiResponse<object>` via `ApiResponse.Json` | — | — |
| 4.1 Build | — | — | — | — | ✅ 0 errors | — | — |
| 4.2 Regression | — | — | — | — | ✅ no existing test/support file modified | — | — |
| 4.3 Purity | — | — | — | — | ✅ `git status --porcelain` matches expectation | — | — |

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~ErrorHandlerMiddlewareTests"` — RED: 3 failed / 3 passed; GREEN: 6/6 passed (0 failed) |
| Runtime harness command/scenario and exact result | N/A — hermetic in-process harness (real `ErrorHandlerMiddleware` + `DefaultHttpContext` + `MemoryStream` + hand-rolled `RecordingLogger<T>`); no live server, no PostgreSQL |
| Rollback boundary | Revert `ErrorHandlerMiddleware.cs:60-62` only (`LogError` restored) — test file stays green except R1–R3 Warning cases (flip requires user approval per scope rule) |

## Test Summary

- **Total tests written**: 6 (new file `ErrorHandlerMiddlewareTests.cs`)
- **Total tests passing**: 6/6
- **Layers used**: E2E hermetic (6) — no unit/integration layers involved this change
- **Approval tests** (refactoring): 3 (R4×2 + R5 written RED-first and passing both before and after the edit, pinning unchanged Error/Debug behavior)
- **Pure functions created**: 0 (test harness only)

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `backend/src/SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs` | Modified (one catch, `:60-62`) | Generic catch now logs `ValidationException`/`ApiException` at Warning with message only (no exception arg); all other types keep `LogError(error, ...)`. Switch/serializer/client-disconnect branch untouched. |
| `backend/src/SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` | Created | 6-case hermetic suite: `RecordingLogger<T>` + `Run(Exception)` direct-invocation harness + envelope assertions via `ApiResponse<object>`/`ApiResponse.Json`. Not in `[Collection("e2e")]` (D5). |
| `openspec/changes/b5-error-log-severity/tasks.md` | Modified | All 16 tasks marked `[x]`. |
| `openspec/changes/b5-error-log-severity/apply-progress.md` | Created | This artifact. |

## Deviations from Design

None — implementation matches design.md exactly (production edit shape, RecordingLogger<T>, Run harness, 6-case table, no fake middleware, RED against real middleware).

Notes (non-deviations, flagged for verify):
- Design's switch range comment `:64-94` reads `:70-94` in the actual file — informational only, nothing changed.
- Design TDD note says "4 Warning cases"; authoritative 6-case table lists 3 Warning cases (R1–R3). RED run showed exactly 3 failures, as the tasks.md TDD note predicted. Correct.
- `ApiResponse<object>` deserialization: body is camelCase (middleware `JsonSerializerDefaults.Web`), `ApiResponse.Json` is case-insensitive → maps to `Succeeded/ActionCode/Errors(Code,Description)/Message` unchanged.

## Issues Found

None blocking. Pre-existing NU1903/NU1902 package-vulnerability warnings and CS8xxx nullable warnings during build are unrelated to this change (verified identical before/after).

## Remaining Tasks

None — all 16 tasks complete. Next phase: verify.

## Workload / PR Boundary

- Mode: single PR (400-line budget risk Low; chained PRs not recommended; chain strategy pending → no chain)
- Current work unit: 1 (log-level fix + hermetic proof suite)
- Boundary: new test file + one production catch; nothing else
- Estimated review budget impact: ~210 changed lines

## Status

16/16 tasks complete. Ready for verify.
