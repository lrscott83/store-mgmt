# Apply Progress: h15-server-side-plan-lock

**Change**: `h15-server-side-plan-lock`
**Date applied**: 2026-08-13
**Applied by**: SDD apply sub-agent
**Branch**: `feat/h15-server-side-plan-lock` (commit-only, no PR)
**Phase status**: ✅ Complete

---

## Implementation Record

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1.1 | Create `UpdateStoreCommandHandlerLockTests.cs` — RED: OwnerAdmin, store modules [7 free, 6 paid], PUT [7] → `ValidationException` `PlanLocked` | ✅ Done | `5a28e0e3` |
| 1.2 | Same file, no-false-rejection pins: same set [7,6] / free-store activation / IsSuperAdmin carve-out; stub downstream repos; assert `SaveChangesAsync` | ✅ Done | `5a28e0e3` |
| 2.1 | Add `PlanLocked` key (ES) to `I18n.resx` | ✅ Done | `5a28e0e3` |
| 2.2 | Add `PlanLocked` key (EN) to `I18n.en.resx`; indexer access only — no Designer regen | ✅ Done | `5a28e0e3` |
| 2.3 | Insert lock guard in `UpdateStoreCommand.cs` after null-store guard, before duplicate-name check: `!IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded)` + distinct-sorted `SequenceEqual` → `ValidationException` `PlanLocked`; zero extra queries | ✅ Done | `5a28e0e3` |
| 2.4 | Run 1.1/1.2 filter → all GREEN (RED first: 1 fail / 3 pass, then 4/4) | ✅ Done | `5a28e0e3` |
| 3.1 | Create `StorePlanLockTests.cs`: `OwnerAdmin_changes_modules_on_paid_store_returns_400_PlanLocked` | ✅ Done | `9995359f` |
| 3.2 | `OwnerAdmin_rename_only_on_paid_store_returns_200` (same set [7,6] + new name) | ✅ Done | `9995359f` |
| 3.3 | `OwnerAdmin_activates_free_store_returns_200` | ✅ Done | `9995359f` |
| 3.4 | `SuperAdmin_changes_modules_on_paid_store_returns_200` | ✅ Done | `9995359f` |
| 3.5 | Run StorePlanLockTests filter → RED vs baseline (guard removed: 1 fail / 3 pass), GREEN after guard restored (4/4) | ✅ Done | `9995359f` |
| 4.1 | `store-fixture.ts` `degradeStoreToFreePlan`: replace PUT with pg `Client` direct-DB seeding (`E2E_DB_URL` ?? `DEFAULT_DB_URL`); BEGIN → DELETE StoreRoleFeature/StoreModule → INSERT free-only modules FROM `Module` → COMMIT; keep re-GET pinning; Store row untouched | ✅ Done | `bc50f45c` |
| 4.2 | Update file header comment — H-15 lock is server-side; PUT-seeding rationale obsolete | ✅ Done | `bc50f45c` |
| 5.1 | Full backend suite: `dotnet test backend/src/SMCA.sln` — Domain 22/22, Application 341/341 (incl. 4 new lock unit tests), SMCA.WebApi.E2ETests 354/354 | ✅ Done | — |
| 5.2 | Frontend: `store-plan-activation.spec.ts` 2/2 passed against `http-e2e` backend (S2-01/S2-02 green with direct-DB seeding) | ✅ Done | — |
| 5.3 | Commits (conventional, no AI attribution) | ✅ Done | `5a28e0e3`, `9995359f`, `bc50f45c` |

**Result**: 16/16 tasks complete.

## Commits

```
5a28e0e3 feat(store): enforce DG-7 plan lock for paid stores
9995359f test(e2e): cover plan lock on PUT /stores/{id}
bc50f45c test(e2e): seed free plan via direct DB
```

All three on branch `feat/h15-server-side-plan-lock` (no push, no PR per delivery decision).

## Files Changed

| File | Change |
|------|--------|
| `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | DG-7 one-way plan lock guard (non-SuperAdmin + active paid module + changed module set → 400 `PlanLocked`) |
| `backend/src/Resources/Localization/I18n.resx` | `PlanLocked` key (ES), UTF-8 BOM + CRLF preserved |
| `backend/src/Resources/Localization/I18n.en.resx` | `PlanLocked` key (EN), UTF-8 BOM + CRLF preserved |
| `backend/src/Application.Tests/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommandHandlerLockTests.cs` | NEW — 4 unit tests (lock fires + 3 no-false-rejection pins) |
| `backend/src/SMCA.WebApi.E2ETests/Stores/StorePlanLockTests.cs` | NEW — 4 E2E tests (400 lock + 3 pins) |
| `frontend-react/e2e/support/store-fixture.ts` | `degradeStoreToFreePlan` rewritten: PUT → direct-DB seeding (pg Client); header comment updated |
| `openspec/changes/h15-server-side-plan-lock/tasks.md` | All 16 tasks marked `[x]` |

## Verification Evidence

- **Unit (strict TDD)**: RED — 1 fail / 3 pass (lock test threw no exception on baseline) → GREEN — 4/4 after guard.
- **E2E (strict TDD)**: RED vs baseline (guard temporarily removed) — lock test failed with 200-vs-400, 3 pins passed → GREEN — 4/4 after guard restored.
- **Full backend suite**: `dotnet test backend/src/SMCA.sln` — Domain **22/22**, Application **341/341** (incl. 4 new lock unit tests), SMCA.WebApi.E2ETests **354/354**. Pin tests `StoreCreationTrialTests` / `StoreAuthorizationTests` green within the 354.
- **Frontend**: `pnpm exec playwright test store-plan-activation.spec.ts` — **2/2 passed** against the `http-e2e` backend (S2-01/S2-02 green with direct-DB seeding).
- **Fixture loads**: `playwright test --list` — all 55 tests load cleanly.

## Notes

- E2E OwnerAdmin actor must be seeded via `AuthzSeed.SeedOwnerAdminAsync(withManagementModule: true)` — BillingSeed users have `SelectedStoreId = Guid.Empty`, which the StoresController `[HasPermission]` feature filter rejects with 403 before the handler runs (matches `StoreCreationTrialTests:286-325` pin pattern).
- `pg` / `@types/pg` were declared in `frontend-react/package.json` + lockfile but never materialized in node_modules — ran `pnpm install --prefer-offline` to install them (the harness otherwise fails with "Cannot find module 'pg'").
- One flaky run of `store-plan-activation.spec.ts` failed inside the pre-existing `session.ts` `mintOwnerAdmin` (navigation-timing race, before the fixture runs) — re-run passed 2/2; unrelated to this change. No existing E2E test was modified.
- Unrelated working-tree changes (`docs/testing/e2e-stage-1/*`, `openspec/changes/h15-server-side-plan-lock/` folder itself) remain uncommitted — expected; only the 3 work-unit commits were created.