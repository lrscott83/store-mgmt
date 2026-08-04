# Archive Report: getme-failure-as-200-backend

**Change**: `getme-failure-as-200-backend`  
**Archived**: 2026-08-04  
**Archive location**: `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/`  
**Mode**: hybrid (openspec + engram) — **Engram MCP not exposed this session**; archive report persisted on the openspec filesystem side only. Engram persistence (`sdd/getme-failure-as-200-backend/archive-report`) is a noted gap, to be backfilled when the MCP is available.

---

## Executive Summary

`AuthController.GetMeAsync` (`/auth/me`) previously wrapped every result in `Ok(...)`, so a terminated session (inactive user, token blacklisted) reached the client as HTTP 200 `succeeded:false` — which the frontend treated as a successful fetch, gutting the cached profile while keeping `isAuthenticated: true`. This change maps `ResponseResult.ActionCode` to a real HTTP status: failure → 404 + envelope, success → 200. 401 stays reachable via the blacklist middleware before the action executes. Delivered as requirement **AU-ME1** (1 requirement, 5/5 scenarios compliant). Full suite green: **621/621** (Application.Tests 314, Domain.UnitTests 22, E2E 285). Build exit 0, 0 errors (8 pre-existing NU1902/NU1903 package-vulnerability warnings, unrelated to this change).

## Requirements Delivered

| Requirement | Action | Scenarios |
|-------------|--------|-----------|
| AU-ME1 — GetMeAsync Maps ActionCode to Real HTTP Status (Failure → 404, Success → 200) | Added | 1a unknown→404, 1b inactive→404+blacklist, 1c active→200, 1d blacklisted→401 (middleware, action NOT executed), 1e asymmetry documented |

Delta spec merged into base: `openspec/specs/api-controller/spec.md` (appended as a new delta block, preserving all prior requirements — no MODIFIED/REMOVED/RENAMED blocks in this change).

## Verification Evidence (FINAL)

Per `verify-report.md` (schema `gentle-ai.verify-result/v1`, evidence_revision `sha256:99a06fdd...`), verdict **PASS**, 0 CRITICAL findings:

| Check | Result |
|-------|--------|
| Build | ✅ `dotnet build backend/src/SMCA.sln`, exit 0, 0 errors (8 pre-existing NU warnings) |
| Tests | ✅ `dotnet test backend/src/SMCA.sln`, 621/621 (Application.Tests 314/314, Domain.UnitTests 22/22, E2E 285/285) |
| Requirements | 1/1 (AU-ME1) |
| Scenarios | 5/5 compliant (1a/1b/1d via new E2E, 1c via unchanged regression, 1e via source inspection) |
| TDD | 4/6 checks passed; 2 documentation-gap only (no `apply-progress` artifact — RED/GREEN evidence lives in tasks.md ACCEPT annotations; no protocol violation) |

No CRITICAL issues — archive gate passed. The two WARNINGs (scope deviation below; missing apply-progress artifact) are non-blocking and recorded for the audit trail.

## Scope Deviation (verified + signed off)

**Finding — `backend/src/SMCA.WebApi/Extensions/ServiceExtensions.cs` (+22 lines)**: the design planned 3 modified files; apply added blacklist enforcement to the named "Bearer" `AddJwtBearer` lambda. Verified root cause: `ConfigureOptions<JwtBearerOptionsSetup>` is skipped for the named "Bearer" options; the `AddJwtBearer(options => ...)` lambda registers its own `JwtBearerEvents` and replaces `options.Events` wholesale, so the setup's `OnTokenValidated` never ran — **revoked tokens were accepted (latent security bug)**. Without the fix, spec scenario 1d / task 3.1 (second call → 401) was impossible. The fix (`ServiceExtensions.cs:54-73`) re-attaches `OnTokenValidated` inside the live lambda; the new second-call 401 E2E passes, proving enforcement end-to-end. **Verdict: justified and REQUIRED — sign-off given in verify.** Diff: 4 files (AuthController.cs, AuthMeFailureTests.cs, GetMeQueryHandlerTests.cs, ServiceExtensions.cs), ~160+/5-.

## Suggestion Recorded (not part of this change)

`JwtBearerOptionsSetup.cs` is **fully shadowed** by the `AddJwtBearer` lambda (both TVP and Events overwritten) — its blacklist `OnTokenValidated` is dead code. Harmless at runtime (no double enforcement, no security regression — the lambda enforces now) but misleading: a future maintainer may trust the dead copy and remove the live lambda check. **Recommendation: remove the dead `ConfigureOptions<JwtBearerOptionsSetup>` registration + class, or strip its `Events` block and keep TVP config in one place.** This is a future-maintainer cleanup, explicitly NOT part of this change.

## Plan Doc Status

- `docs/plans/2026-08-02-getme-failure-as-200-backend.md` — **marked RESOLVED 2026-08-04** (header annotation added; doc retained as historical record because Task 4's frontend history is referenced there and in `explore.md`). Tasks 1–3 implemented+verified here; Task 4 (frontend) was already implemented earlier on `frontend-react`.
- `docs/plans/2026-07-30-offline-roster-billing-gate-backend-plan.md` and `docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md` — deleted by the orchestrator (`git rm`, staged) prior to this archive. Not recreated.

## Non-Goals / Session Constraints

- **No commits** — session constraint. Implementation complete in the working tree; HEAD remains `691c6fb6` (branch `main_backend`). Delivery deferred.
- **Frontend already done** — Task 4 of the plan (`auth-store` logs out on 401/404) was implemented earlier; this change is backend-only.
- Other 63 actions keep the 200 + envelope convention (deliberate, documented asymmetry); no shared mapper introduced.

## Artifacts

| Artifact | Location |
|----------|----------|
| Proposal | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/proposal.md` |
| Exploration | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/explore.md` |
| Delta Spec | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/specs/api-controller/spec.md` |
| Design | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/design.md` |
| Tasks | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/tasks.md` (7/7 complete) |
| Verify Report | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/verify-report.md` |
| Archive Report | `openspec/changes/archive/2026-08-04-getme-failure-as-200-backend/archive-report.md` (this file) |

## Source of Truth Updated

- `openspec/specs/api-controller/spec.md` — AU-ME1 appended; all prior requirements preserved.

## SDD Cycle Complete

| Phase | Status |
|-------|--------|
| Proposal | ✅ Complete |
| Exploration | ✅ Complete |
| Spec | ✅ Complete |
| Design | ✅ Complete |
| Tasks | ✅ Complete (7/7) |
| Apply | ✅ Complete (no commits — session override) |
| Verify | ✅ PASS (621/621) |
| Archive | ✅ Complete |
