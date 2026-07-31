# Archive Report: 2026-07-31-get-user-by-id-endpoint-fixes

**Archived**: 2026-07-31
**Status**: ✅ Complete
**Mode**: HYBRID (engram + openspec)
**Verdict**: ✅ PASS

---

## Executive Summary

Six targeted fixes applied to `GET /api/v1/users/{id}` (`UsersController.GetUserAsync`) across 8 source/test files: fixed `ownerName: null` (missing `.ThenInclude(o => o.User)` — resolved via `IncludeStoreAndRoles` helper reuse), replaced the validator's double round-trip `GetByIdAsync` with a lightweight `ExistsAsync(Guid)` (`IgnoreQueryFilters().AnyAsync`), added the envelope-404 race guard (no more 200 `data:null`), propagated `CancellationToken` through handler + repository, added Swagger `[ProducesResponseType(200/400/401/403)]` + `[FromRoute]`, made `UserDto` NRT-clean, and fixed the same `.ThenInclude` bug in `GetByLoginWithRelatedAsync`. One new body-asserting E2E test (SuperAdmin actor → seeded OwnerAdmin target, actor ≠ target) proves the include fix RED→GREEN. Contract decision **D1=A** confirmed: non-existent id → **400 via validator**; envelope-404 reserved for the race window only.

**Verification**: 13/13 tasks complete, 348 tests / 0 failures, build 0 errors.

---

## D7 — Main Spec Alignment (mandatory archive step)

The main spec `openspec/specs/users-e2e/spec.md` R2:46 documented "Non-existent id → 404", contradicting the final contract (400 via validator, decision D1=A) and the existing E2E test `Get_nonexistent_id_returns_400` (asserts 400).

| | Row (R2: Get User by Id) |
|---|--------------------------|
| **Before** | `| Non-existent id | SuperAdmin | 404 |` |
| **After** | `| Non-existent id | SuperAdmin | 400 (validator) |` |

**Whole-spec contradiction scan**: ✅ No other row contradicts the final contract.
- R2 "Invalid id format → 400 or 404" already permits 400 — no change.
- The other `Non-existent id → 404` rows (R3 Update, R4 Delete, R6/R7/R8 role ops, R10 Get Store User by Id) belong to **different endpoints** whose contracts this change did not touch — left unchanged.
- Header `Last Updated` bumped 2026-07-24 → 2026-07-31.

Committed separately as `docs(sdd):` (see Commits).

---

## Artifact Observation IDs (Engram)

| Artifact | Topic Key | Engram ID |
|----------|-----------|-----------|
| Exploration | `sdd/get-user-by-id-endpoint-fixes/explore` | #501 |
| Proposal | `sdd/get-user-by-id-endpoint-fixes/proposal` | #502 |
| Spec | `sdd/get-user-by-id-endpoint-fixes/spec` | #503 |
| Design | `sdd/get-user-by-id-endpoint-fixes/design` | #505 |
| Tasks | `sdd/get-user-by-id-endpoint-fixes/tasks` | #506 |
| Apply Progress | `sdd/get-user-by-id-endpoint-fixes/apply-progress` | #507 |
| Verify Report | `sdd/get-user-by-id-endpoint-fixes/verify-report` | #508 |
| **Archive Report** | **`sdd/get-user-by-id-endpoint-fixes/archive-report`** | **#509** |

---

## Specs Synced to Main

| Domain | Action | Details |
|--------|--------|---------|
| `api-controller` | Updated (appended delta) | UC-G1 (ProducesResponseType 400/401/403) + UC-G2 ([FromRoute] on id) |
| `command-handler` | Updated (appended delta) | CH-G1 (envelope-404 race guard) + CH-G2 (CancellationToken forward) |
| `validation` | Updated (appended delta) | VL-G1 (ExistsAsync lightweight check) + VL-G2 (400 semantics preserved) |
| `dto` | Updated (appended delta) | DT-G1 (OwnerName/StoreName `string?`) + DT-G2 (RoleNames `= []`) |
| `repository` | Updated (appended delta) | RR-G1 (ExistsAsync), RR-G2 (helper reuse + token), RR-G3 (ThenInclude + token) |
| `users-e2e` | Updated (delta appended) + **R2 row aligned to 400 (D7)** | E2E-G1 (seed row), E2E-G2 (body test RED→GREEN), E2E-G3 (archive alignment) |

> Note: the per-domain main specs (api-controller, command-handler, validation, dto, repository) carry **pre-existing uncommitted deltas from earlier batches** (get-users-all, set-my-store, approve-store, update-store…). The delta merges above were applied on disk per project convention but were **left uncommitted** to avoid sweeping unrelated content into this change's commits (same as the prior get-users-all archive). Only `users-e2e/spec.md` (D7 alignment) is committed with this archive.

---

## Verification Results

- **Tasks**: 13/13 complete
- **Build**: ✅ 0 errors (full solution `backend/src/SMCA.sln`)
- **Tests**: ✅ 348 passed, 0 failures (5 UsersGetById, 20 UsersList+UsersUpdate, 301 Application.Tests, 22 Domain.UnitTests)
- **Spec compliance**: 13/13 requirement groups green; 1 scenario (CH-G1 race path) static-only evidence — acceptable per design scope
- **RED→GREEN proven**: Commit A RED (1 fail: ownerName null as designed, 4 pass) → Commit B GREEN (5/5)

## Commits

| Commit | Message | Scope |
|--------|---------|-------|
| `2b838542` | `fix(api): get user by id endpoint fixes (SDD batch)` | Tasks 1-8 (seed, test, DTO, interface, repo, validator, handler, controller) |
| `4a6ab0b9` | `fix(api): reuse IncludeStoreAndRoles helper in get user by id (SDD batch)` | Task 9 + RoleNames assertion fix |
| `235bc990` | `fix(api): overload GetByLoginWithRelatedAsync to avoid optional arg in expression trees` | T13 resolution (CS0854 ×20) |
| *(this archive)* | `docs(sdd): align users-e2e spec R2 non-existent id to 400` | D7 main-spec alignment |
| *(this archive)* | `chore(sdd): archive get-user-by-id-endpoint-fixes` | Archive folder move + report |

All conventional commits, **no AI attribution**.

## Deviations (documented, none blocking)

1. **RoleNames assertion** (Commit B): spec/design literal "OwnerAdmin" was factually wrong — Role rows seed `RoleType.X.GetDisplayName()` ("Administrador de tienda"). Test asserts `RoleType.OwnerAdmin.GetDisplayName()`; endpoint code was never wrong.
2. **T13 overloads** (Commit C, orchestrator-approved): interface overload pair (1-arg delegates, 2-arg no default) instead of literal optional param — Moq expression trees cannot omit optional args (CS0854 ×20). AuthenticationService.cs + 20 Moq setups untouched.
3. **Working tree pre-existing deltas** (Commit A): get-users-all-endpoint-fixes batch (IncludeStoreAndRoles helper etc.) was never committed; included by necessity. Dirty unrelated files (frontend, middleware, Program.cs, other specs) remain uncommitted.

## Archive Contents

```
openspec/changes/archive/2026-07-31-get-user-by-id-endpoint-fixes/
├── proposal.md
├── specs/
│   ├── api-controller/spec.md
│   ├── command-handler/spec.md
│   ├── dto/spec.md
│   ├── repository/spec.md
│   ├── users-e2e/spec.md
│   └── validation/spec.md
├── design.md
├── explore.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
└── archive-report.md
```

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/users-e2e/spec.md` — R2 "Non-existent id" row aligned 404 → 400 (validator) + appended E2E-G1/G2/G3 delta (committed)
- `openspec/specs/api-controller/spec.md` — appended UC-G1/UC-G2 delta (uncommitted, pre-existing dirty file)
- `openspec/specs/command-handler/spec.md` — appended CH-G1/CH-G2 delta (uncommitted, pre-existing dirty file)
- `openspec/specs/validation/spec.md` — appended VL-G1/VL-G2 delta (uncommitted, pre-existing dirty file)
- `openspec/specs/dto/spec.md` — appended DT-G1/DT-G2 delta (uncommitted, pre-existing untracked file)
- `openspec/specs/repository/spec.md` — appended RR-G1/RR-G2/RR-G3 delta (uncommitted, pre-existing untracked file)

## Risks

- **Dirty working tree**: pre-existing uncommitted deltas (get-users-all, set-my-store, approve-store, update-store batches + frontend/middleware/Program.cs) remain — orchestrator should handle separately. The merged main per-domain specs are on disk but uncommitted by design.
- **Race-guard (CH-G1 1a)** has no automated test — regression risk low (mirrors `GetStoreByIdQuery` precedent) but untested.
- **`ExistsAsync` semantics**: `IgnoreQueryFilters()` in the validator existence check intentionally includes soft-deleted rows (mirrors `IStoreRepository` precedent); handler query remains FILTERED, so the race guard absorbs any cross-tenant mismatch (unfiltered validator=true → filtered handler=null → 404).

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
