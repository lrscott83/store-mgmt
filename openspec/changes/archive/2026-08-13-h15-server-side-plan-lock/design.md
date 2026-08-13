# Design: H-15 — Server-side DG-7 plan lock in `UpdateStoreCommandHandler`

## Technical Approach

Handler-level, one-way DG-7 lock in `UpdateStoreCommandHandler.Handle`. The store loads with its **active** `StoreModule` rows already carrying `ModulePriceIncluded` (`GetStoreByIdIncludingModulesAsync`, `StoreRepository.cs:68-76`), so the lock needs zero extra queries. When the caller is not SuperAdmin, the store has any active paid module, and the requested `ModuleIds` differ from the current active set (distinct-sorted), reject with `ValidationException` + code `PlanLocked` → 400 (handler convention `:76,:79`; 403 stays reserved for the identity guard `:72`). The trigger mirrors the React UI exactly (`store-form.tsx:83,252`: `!isSuperAdmin && isOnPaidPlan`). Contract: `specs/billing/spec.md` Lock (MODIFIED) + scenarios.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Trigger | (a) set-change on paid store; (b) any update once `PaymentStartDate != null`; (c) filter-level guard | (b) breaks `StoreCreationTrialTests.cs:286-325` and blocks activation (S2-02 regression); (c) needs extra queries, splits the rule | (a) |
| Set semantics | distinct-sorted vs raw order vs `SetEquals` | validator does not dedupe (`UpdateStoreCommandValidator.cs:30-33`); duplicates/order must never reject | distinct-sorted equality |
| Rejection | `ValidationException` → 400 vs `ApiException` → 403 | 400 matches handler convention and code-based assertions (`StoreUpdateTests.cs:197-214`); 403 is the identity-guard contract | `ValidationException` + code `PlanLocked` |
| Paid check | `store.StoreModules.Any(sm => !sm.ModulePriceIncluded)` vs clock proxy | modules are the real DG-7 trigger (S2-02, `billing/spec.md:13`); loaded data, no query | loaded `StoreModules` |
| Placement | after store load vs after duplicate-name check | lock is cheaper (no query) and rejects earliest | immediately after null-store guard (`:77`) |
| Seeding (S2-01) | (A) SuperAdmin PUT — login #6 → 429; (B) direct-DB pg; (C) .NET fixture | B mirrors `global-teardown.ts` precedent, keeps the 5/5 login budget, immune to the lock | B |

## Data Flow

    PUT /api/v1/stores/{id} (OwnerAdmin)
      → Handle → identity guard (:71)        403 if neither SA nor OA
      → GetStoreByIdIncludingModulesAsync    active StoreModules incl. ModulePriceIncluded
      → null guard (:76)                     400 "Id"
      → LOCK GUARD (:77)                     400 "PlanLocked": !IsSuperAdmin
                                               ∧ any active paid module
                                               ∧ distinct-sorted(request.ModuleIds)
                                                 ≠ distinct-sorted(active ids)
      → duplicate-name (:79) → mutate (:81-101) → UpdateStoreModules (:104) → SaveChanges

    S2-01 seeding (store-fixture.ts): pg client, BEGIN →
      DELETE StoreRoleFeature WHERE StoreId=$1
      DELETE StoreModule WHERE StoreId=$1
      INSERT free-only modules (SELECT … FROM Module m, Store s)
      COMMIT → re-GET via API, assert ids + paymentStartDate non-null (pinning kept)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs` | Modify | Lock guard after `:76` |
| `backend/src/Resources/Localization/I18n.resx` | Modify | New `PlanLocked` key (ES base) |
| `backend/src/Resources/Localization/I18n.en.resx` | Modify | New `PlanLocked` key (EN override) |
| `backend/src/SMCA.WebApi.E2ETests/Stores/StorePlanLockTests.cs` | Create | 4 ADD-only E2E tests |
| `backend/src/Application.Tests/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommandHandlerLockTests.cs` | Create | Unit tests (Moq, strict TDD) |
| `frontend-react/e2e/support/store-fixture.ts` | Modify | `degradeStoreToFreePlan` → direct-DB (authorized) |
| `openspec/changes/h15-server-side-plan-lock/design.md` | Create | This doc |

## Interfaces / Contracts

Lock branch (non-obvious — set comparison over loaded modules):

    if (!_httpContextService.IsSuperAdmin
        && store.StoreModules.Any(sm => !sm.ModulePriceIncluded))
    {
        var requested = request.ModuleIds.Distinct().OrderBy(id => id);
        var current = store.StoreModules.Select(sm => sm.ModuleId).Distinct().OrderBy(id => id);
        if (!requested.SequenceEqual(current))
            throw new ValidationException
            {
                Errors = new List<Error> { new Error("PlanLocked", _localizer["PlanLocked"]) }
            };
    }

- `ValidationException` defaults to 400 (`ApiException` base, `StatusCode = BadRequest`). Error code == key name; tests assert `Errors.Contain(e => e.Code == "PlanLocked")`.
- resx: `<data name="PlanLocked" xml:space="preserve"><value>…</value></data>` in both files. Proposed: ES "El plan de la tienda está bloqueado. Solo un SuperAdmin puede modificar los módulos del plan." / EN "The store plan is locked. Only a SuperAdmin can change the store's modules." Indexer access only — no `I18n.Designer.cs` regeneration.
- Seeding SQL (transaction; `Store` row untouched → `PaymentStartDate` stays non-null for S2-02; columns per `20240910194934_Create-Store-Module-Price.cs:83-98`):

```sql
DELETE FROM "StoreRoleFeature" WHERE "StoreId" = $1;
DELETE FROM "StoreModule" WHERE "StoreId" = $1;
INSERT INTO "StoreModule" ("StoreId","ModuleId","ModulePriceIncluded","Price","ModulePrice",
    "ModuleDiscountPrice","ModulePercentDiscountPrice","TenantId","IsActive",
    "CreatedDate","CreatedBy","UpdatedDate","UpdatedBy")
SELECT s."Id", m."Id", m."PriceIncluded", m."Price", m."Price",
    m."DiscountPrice", m."PercentDiscountPrice", s."TenantId", true,
    now(), '00000000-0000-0000-0000-000000000000', NULL, NULL
FROM "Module" m, "Store" s
WHERE m."Id" = ANY($2::int[]) AND s."Id" = $1;
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (RED first) | lock fires: OA + paid store + changed set → `ValidationException`, `Errors` contains `PlanLocked` | Moq `IHttpContextService` (`IsSuperAdmin=false`, `IsSuperAdminOrOwnerAdmin=true`), `IGetStoreByIdService` → `Store` with modules [7 free, 6 paid], `IStringLocalizer` `["PlanLocked"]`; no downstream repo mocks needed (guard throws first) |
| Unit | no false rejection: same set / free store activation / SuperAdmin carve-out | same mocks with equal sets, no paid module, or `IsSuperAdmin=true`; stub downstream repos (`_storeRepository.Where` → empty, `_moduleRepository`, `_storeModuleRepository`, `_storeRoleFeature*`, `_featureRepository`, `_storeRoleFeaturesGenerator`, `_applicationUnitOfWork.SaveChangesAsync` → 1); assert no throw + `SaveChangesAsync` called |
| E2E (new) | `OwnerAdmin_changes_modules_on_paid_store_returns_400_PlanLocked` | `BillingSeed.SeedPaidStoreAsync` (modules [7,6]); PUT `[7]` → 400 + code |
| E2E (new) | `OwnerAdmin_rename_only_on_paid_store_returns_200` | same seed; PUT `[7,6]`, new name → 200 |
| E2E (new) | `OwnerAdmin_activates_free_store_returns_200` | `BillingSeed.SeedFreeStoreAsync` (free [7]); PUT `[7,6]` → 200 |
| E2E (new) | `SuperAdmin_changes_modules_on_paid_store_returns_200` | `DbTestHelpers.SeedSuperAdminAsync` + `SeedPaidStoreAsync`; PUT `[7]` → 200 |
| Regression | `StoreCreationTrialTests.cs:286-325` (same set [7,6] → 200); `StoreAuthorizationTests.cs:55-75` (free store); S2-01/S2-02 | existing tests untouched; must stay green |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The pg direct-DB seeding is a data-access boundary in the test harness mirroring `global-teardown.ts`; SQL is constant, parameterized (`$1`/`$2`), and scoped to the seeded store id.

## Migration / Rollout

No data migration, no feature flag. Rollback: revert the guard block + remove the two resx keys; revert `store-fixture.ts` to PUT seeding (must ship together with guard removal); discard delta spec.

## Open Questions

- [ ] None blocking — exact ES/EN `PlanLocked` wording confirmed at apply.