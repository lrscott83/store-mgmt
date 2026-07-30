# Archive Report

**Change**: stores-by-current-user-fixes
**Date Archived**: 2026-07-30
**Domain**: stores-by-current-user

---

## Summary

Change fixing **6 bugs** in `GET /api/v1/stores/by-current-user`:

| Bug | Severity | Description |
|-----|----------|-------------|
| BUG-1 | 🔴 HIGH | Non-superadmins saw ALL stores in tenant (data leak) |
| BUG-2 | 🔴 HIGH | `OwnerName` mapping crashed with NRE (missing `.ThenInclude`) |
| BUG-3 | 🟡 MEDIUM | DefaultStore filter ran client-side after materialization |
| BUG-4 | 🟡 MEDIUM | Hardcoded `true` for `includeInactive` returned inactive stores |
| BUG-5 | 🟢 LOW | Missing `[ProducesResponseType(401)]` and `[ProducesResponseType(403)]` |
| BUG-6 | 🟢 LOW | Missing XML `<summary>` doc comment |

## Tasks

| Metric | Value |
|--------|-------|
| Total tasks | 8 |
| Completed | 8 |
| Incomplete | 0 |

## Verification Results

| Check | Result |
|-------|--------|
| Build | ✅ 0 errors |
| E2E Tests | ✅ 6/6 passed |
| Spec Compliance | 9/12 compliant (3 untested — structural evidence supports correct implementation) |
| Critical Issues | ❌ None |

**Verdict**: PASS WITH WARNINGS

## Main Spec

The delta spec was a **new domain** (no existing main spec). Copied to:
```
openspec/specs/stores-by-current-user/spec.md
```

## Artifact Lineage

All artifacts moved from:
```
openspec/changes/stores-by-current-user-fixes/
```
→
```
openspec/changes/archive/2026-07-30-stores-by-current-user-fixes/
```

| Artifact | Status |
|----------|--------|
| `explore.md` | ✅ Moved |
| `proposal.md` | ✅ Moved |
| `design.md` | ✅ Moved |
| `tasks.md` | ✅ Moved |
| `apply-progress.md` | ✅ Moved |
| `verify-report.md` | ✅ Moved |
| `archive-report.md` | ✅ Created |
| `specs/stores-by-current-user/spec.md` | ✅ Moved + copied to main specs |

## Active Changes Directory

```
openspec/changes/ (post-archive)
├── archive/
│   └── 2026-07-30-stores-by-current-user-fixes/  ← this archive
├── pending/
└── pwa-offline-shell/
```

## Files Changed (Implementation)

| File | Action |
|------|--------|
| `Domain/Interfaces/Repositories/IStoreRepository.cs` | Modified |
| `Infrastructure/Persistence/Repositories/StoreRepository.cs` | Modified |
| `Application/.../GetStoresByCurrentUserQuery.cs` | Modified |
| `SMCA.WebApi/Controllers/v1/StoresController.cs` | Modified |
| `SMCA.WebApi.E2ETests/Stores/StoresByCurrentUserTests.cs` | Modified |
| `Application.Tests/.../ExportOfflineRosterQueryHandlerTests.cs` | Modified |

## Follow-Up Items

1. **⚠️ R1c — Untested**: No E2E test verifying inactive stores are excluded for Non-SuperAdmin (code is structurally correct with `s.IsActive` filter)
2. **⚠️ R1d — Untested**: No E2E test for StoresAdmin with zero owned stores (empty 200 OK)
3. **⚠️ R2a — Untested**: Existing SuperAdmin E2E tests don't assert `OwnerName` is populated (code is structurally correct with `.ThenInclude`)
4. **⚠️ R3b — Untested**: Non-SuperAdmin DefaultStore exclusion not explicitly tested

All 4 are **missing test coverage**, not implementation bugs.

## Engram Persistence

- **Project**: store-mgmt
- **Topic key**: `sdd/stores-by-current-user-fixes/archive-report`
- **Type**: architecture
