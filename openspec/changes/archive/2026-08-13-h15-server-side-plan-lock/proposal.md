# Proposal: H-15 — Server-side DG-7 plan lock in UpdateStoreCommandHandler

## Intent

DG-7 ("plan activation — owner, once") is UI-only today: React disables the plan picker (`readOnly`, `store-form.tsx:252`) but the API accepts any module change — `UpdateStoreCommandHandler` (`UpdateStoreCommand.cs:69-106`) has no module-set guard. An OwnerAdmin can swap/downgrade modules on a paid store via direct PUT. H-15 makes the lock a server guarantee (`docs/testing/e2e-stage-1/README.md:302-308`).

## Scope

### In Scope
- Handler-level lock guard after store load, before `UpdateStoreModules`
- New i18n business code → 400 (`I18n.resx` + `I18n.en.resx`)
- Delta spec: MODIFY `billing/spec.md:17` Lock row (stale → real trigger)
- S2-01 seeding: `store-fixture.ts` downgrade → direct-DB via `pg` (Option B)
- ADD-only tests: 4 backend E2E + handler unit tests (Application.Tests)

### Out of Scope
- Frontend React change (UI already readOnly)
- Angular legacy guard (`edit-store.component.html:99-100`) — 4xx accepted, documented only
- Existing E2E spec files (`.cs` / `.spec.ts`) — untouchable
- Rate-limit/refresh (H-13); merge/PR delivery

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `billing`: Lock requirement (`spec.md:17`) rewritten — trigger = any ACTIVE paid module (`!ModulePriceIncluded`) + module-set change, not "once non-null" (delta MODIFIED + scenarios)

## Approach

Guard in `Handle` after store load (`:74-76`), before mutation (`:104`):

`!IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded) && distinctSorted(request.ModuleIds) != distinctSorted(currentActiveIds) → ValidationException`

- Zero extra queries — active modules + `ModulePriceIncluded` already loaded
- 400 + new error code per handler convention (`:76,:79`); tests assert codes
- i18n: new key in `I18n.resx` (ES) + `I18n.en.resx`; indexer access, no Designer regen
- Seeding Option B: DELETE SRF + StoreModule rows, INSERT free-only rows via `pg` (global-teardown precedent, `DEFAULT_DB_URL`); store row untouched — paymentStartDate stays non-null (S2-02)
- Angular legacy: no guard → 4xx documented (parity: migrar ≠ mejorar)

## Business Rules (DG-7)

| Rule | Behavior |
|---|---|
| Trigger | non-SuperAdmin + any active paid module + set change |
| Same-set update | allowed (rename/address) — keeps `StoreCreationTrialTests.cs:286-325` green |
| Free store | activation allowed (no paid module yet) |
| SuperAdmin | carve-out (`spec.md:17`) |
| Set semantics | distinct-sorted equality; duplicates/order never reject |
| Paid modules, null clock | lock applies — trigger is modules, not PaymentStartDate |

## Autorización (project-mandated)

- Production change to `UpdateStoreCommandHandler` + resx: EXPLICITLY REQUESTED by user (H-15 is the change's point)
- `store-fixture.ts` direct-DB seeding: EXPLICITLY AUTHORIZED (Option B)
- NOT authorized: existing E2E tests, other E2E support files

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/.../UpdateStore/UpdateStoreCommand.cs` | Modified | Lock guard in `Handle` |
| `backend/src/Resources/Localization/I18n.resx` + `I18n.en.resx` | Modified | New business code |
| `openspec/specs/billing/spec.md` | Modified | Lock requirement (via delta) |
| `frontend-react/e2e/support/store-fixture.ts` | Modified | Direct-DB seeding (authorized) |
| `backend/src/SMCA.WebApi.E2ETests/...` (new) | New | 4 lock E2E tests |
| `backend/src/Application.Tests/...` (new) | New | Handler lock unit tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale spec wording resurrects paymentStartDate proxy | Med | Delta MODIFIES `spec.md:17` |
| Set-comparison false rejection | Low | Distinct-sorted equality pinned in delta |
| S2-01 seeding drift (DB vs API) | Med | Keep 4-step precondition pinning (re-GET + assert) |
| Angular legacy 4xx for owners | High (accepted) | Documented as expected; companion guard deferred |

## Rollback Plan

Revert the single guard block in `UpdateStoreCommand.cs` + remove the resx key; revert `store-fixture.ts` to PUT seeding (must ship with guard removal to stay safe). Discard delta spec.

## Dependencies

- PostgreSQL `smca_test` reachable (E2E + `pg` seeding)
- Module catalog ids read by the fixture unchanged

## Success Criteria

- [ ] 4 new backend E2E tests green (paid-change → 400+code, same-set → 200, free activate → 200, SuperAdmin → 200)
- [ ] Handler unit tests green (strict TDD, RED first)
- [ ] Existing suites green: `StoreCreationTrialTests.cs:286-325`, `StoreAuthorizationTests.cs:55-75`, S2-01/S2-02
- [ ] Delta spec MODIFIES billing Lock requirement with scenarios