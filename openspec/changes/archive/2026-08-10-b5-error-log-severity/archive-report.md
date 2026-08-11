# Archive Report: b5-error-log-severity

**Change**: Business Rejections Log at Warning, Not Error
**Archived**: 2026-08-10
**Mode**: Hybrid (openspec filesystem + Engram observation)
**Verdict at close**: PASS

## Change Summary

Business rejections (`ValidationException`, `ApiException` — 400/403/404/409 envelopes) in `ErrorHandlerMiddleware` previously logged at Error with the full exception object (`:62`), flooding ops logs with `[ERR] Unhandled exception:` noise. This change moved them to Warning with the message only (`LogWarning("Request rejected: {Message}", error.Message)` — no exception arg → no stack). Genuine faults (unknown types, `KeyNotFoundException`) keep `LogError(error, ...)` with stack; the client-disconnect branch stays Debug. HTTP envelope/status/`ActionCode`/`Errors` are untouched.

## Final State

- **Production change**: EXACTLY +4/-1 in `backend/src/SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs` generic catch (user-authorized, verified via `git diff --stat`: 1 file, 4 insertions, 1 deletion). `ValidationException`/`ApiException` → `LogWarning("Request rejected: {Message}", error.Message)` (message-only, no exception arg); all other types keep `LogError(error, ...)`. Client-disconnect branch (`:39-59`, Debug), switch (`:64-94`), and serializer untouched.
- **Test proof**: NEW file `backend/src/SMCA.WebApi.E2ETests/Middlewares/ErrorHandlerMiddlewareTests.cs` — 6 cases, no Moq (hand-rolled `RecordingLogger<T>`), not in `[Collection("e2e")]` (hermetic, no PostgreSQL).
- **Capability spec**: NEW `openspec/specs/error-handler-logging/spec.md` (created at spec time) — 4 requirements / 6 scenarios, consistent with the change delta. Source of truth reflects the new behavior.
- **Tasks**: 16/16 complete (`[x]`), no stale unchecked tasks.
- **Traceability (Engram observation IDs)**: proposal #706, spec #708, design #709, tasks #710, apply #711, verify #713. This report: `sdd/b5-error-log-severity/archive-report`.

## Requirements Coverage

Change spec (authoritative): **4/4 requirements, 6/6 scenarios** — all covered by passing tests.

| Requirement | Scenarios | Result |
|-------------|-----------|--------|
| R1 Business rejections log at Warning without stack | ValidationException rejection; ApiException 400 and 404 rejections | ✅ COMPLIANT |
| R2 Genuine faults keep Error with stack | Unknown exception type; KeyNotFoundException | ✅ COMPLIANT |
| R3 Client-disconnect branch stays at Debug | Client disconnect | ✅ COMPLIANT |
| R4 New E2E test file proves the contract | Test suite coverage (6 cases, direct instantiation) | ✅ COMPLIANT |

## Evidence

- **Validator**: `gentle-ai sdd-verify-validate` admitted `valid: true, verdict: pass`, requirements 4/4, scenarios 6/6, `evidence_revision` `sha256:5c0f0a8ca9587ece3d54759d687c4537d3d0cca3564572b35d23f1cd185c7e17`.
- **Focused tests (hermetic, no PG)**: `dotnet test ... --filter "FullyQualifiedName~ErrorHandlerMiddlewareTests"` → 6/6 passed, exit 0 (test output hash `sha256:6829c7bbd261e3016d7f83317cf95c7bf8ac272b524d91bcbe3185637bc648aa`).
- **Build**: E2E csproj build → 0 errors, exit 0 (8 pre-existing NU1902/NU1903/CS8xxx warnings, unrelated and identical before/after).
- **Regression (live PostgreSQL)**: filters `Auth|UsersActivate|ErrorHandlerMiddlewareTests` → 99/99 passed; live server output showed real `Request rejected: ...` Warning logs (e.g. "User not found", "Not authorized", "One or more validation failures have occurred.") with every existing Auth/UsersActivate test still green — live proof the envelope contract is unchanged.
- **Coverage (changed file, informational, threshold 0)**: `ErrorHandlerMiddleware.cs` → 94.3% (50/53 lines); changed lines fully covered.
- **RED evidence**: RED run showed exactly 3 failures (R1-R3 Warning cases) / 3 passed (R4×2 Error + R5 Debug), matching the authoritative 6-case table (tasks.md corrected design's "4 Warning cases" miscount).

## Purity (git status --porcelain — authoritative)

```
 M backend/src/SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs        ← authorized +4/-1 (only production change)
?? backend/src/SMCA.WebApi.E2ETests/Middlewares/                        ← NEW test dir (6 cases)
?? openspec/changes/b5-error-log-severity/                              ← this change folder
?? openspec/specs/error-handler-logging/                                ← NEW capability spec
?? frontend-react/openspec/changes/offline-roster-login-actions/        ← pre-existing untracked, unrelated, untouched
```

- Zero existing E2E tests or support files modified (either suite).
- No other production file touched (client-disconnect catch, `Program.cs`, other middleware unchanged).
- Orphaned `WebApiTest/Middlewares/ErrorHandlerMiddleware.cs` copy untouched (not in SMCA.sln).

## Accepted Deviations (user-approved, recorded as such)

- **D1 (spec R4 wording)**: Direct instantiation of the real middleware (`new ErrorHandlerMiddleware(throwingDelegate, recordingLogger)` + `Invoke(context)`) chosen over the spec's original "WebAppFixture" wording. Spec R4 was aligned after user approval 2026-08-10. Contract proven is identical (real middleware class, real log calls, real serializer, real `HttpResponse`); direct invocation deterministically covers all six cases including client-disconnect, needs no PostgreSQL.
- **RED run count**: 3 failures (R1–R3 Warning cases), not 4 as the design's TDD note miscounted — matches the authoritative 6-case table (3 Warning, 2 Error, 1 Debug). tasks.md corrected the note.

## Suggestions Carried Forward (non-blocking)

1. Full-solution regression (`dotnet test backend/src/SMCA.sln`) not run this session; E2E regression filters ran instead (99/99 with live PG). Recommend full suite at the CI gate.
2. Coverage gap: `ErrorHandlerMiddleware.cs` L38 (non-throwing pass-through) and L125-126 (RequestAborted-cancelled) — optional future cases, outside the 6-case contract.
3. Pre-existing NU1902/NU1903 package-vulnerability and CS8xxx nullable build warnings — unrelated tech debt.
4. Design comment range `:64-94` vs actual switch `:73-97` — informational only.

## Non-Goals Honored

- Backend scope rule (NON-NEGOTIABLE): only ADDED new E2E tests; ONLY 1 production file edited (user-authorized); zero existing E2E tests or support files touched in either suite.
- Client-disconnect branch (`:39-59`) untouched (already Debug, commit 75b3264c).
- Live-connection malformed-request behavior unchanged (still 500 + ERR).
- No frontend changes.
- No packages, no migrations, no config change.

## Delivery Note

Single PR, ~210 changed lines, 400-line budget risk Low, no chain (per tasks.md forecast). Hybrid persistence: this file (`openspec/changes/archive/2026-08-10-b5-error-log-severity/archive-report.md`) + Engram observation `sdd/b5-error-log-severity/archive-report` (project `D:\Projects\AutoBusinessPro\Store\store-mgmt`, type `architecture`, capture_prompt false). Archive is an AUDIT TRAIL — archived artifacts are not to be modified.

## SDD Cycle Complete

The change was planned (proposal/spec/design), implemented (apply, 16/16 tasks, strict TDD with RED-GREEN evidence), verified (PASS, 4/4 requirements, 6/6 scenarios, zero CRITICAL/WARNING), and is now archived. Ready for the next change.
