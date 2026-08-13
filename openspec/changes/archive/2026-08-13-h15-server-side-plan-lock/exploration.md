# Exploration: H-15 — Server-side DG-7 plan lock in `UpdateStoreCommandHandler`

> Change: `h15-server-side-plan-lock` · Phase: explore (read-only) · Date: 2026-08-13
> Status: READY FOR PROPOSAL — two user decisions surface (see Risks).
> Constraint carried: backend work may ONLY ADD new E2E tests; existing E2E tests (backend xUnit + frontend Playwright incl. `e2e/support/*.ts`) are UNTOUCHABLE without explicit user authorization.

## Current State

- **No server-side lock exists.** `UpdateStoreCommandHandler.Handle` (`backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs:69-106`) has a single authorization guard — `IsSuperAdminOrOwnerAdmin` (`:71-72`) — and nothing compares the incoming `moduleIds` against the store's current set, nor rejects a plan change on an activated store. Documented as H-15 at `docs/testing/e2e-stage-1/README.md:302-308`: *"DG-7 ... es, del lado servidor, una garantía que no existe: es exclusivamente una barrera de UI"*.
- **DG-7 is UI-only in React.** `store-form.tsx:252` → `readOnly={!isSuperAdmin && isOnPaidPlan}`; `isOnPaidPlan` is `modules.some(m => !m.priceIncluded && m.selected)` (`store-form.tsx:83`). The comment at `:72-82` is explicit: `paymentStartDate != null` was rejected as a proxy — since EVERY store starts its billing clock at creation (`CreateStoreService`, billing/spec.md:14), that proxy would lock the owner out before any plan choice (the S2-02 regression, `docs/testing/e2e-stage-1/S2-02.md:33-35`). `plan-picker.tsx:9-15,100-105`: `readOnly` removes the "Activar este plan" button; `onChange` is wired only to that button, so `moduleIds` never changes.
- **The handler already loads everything the lock needs.** `GetStoreByIdIncludingModulesAsync` (`StoreRepository.cs:68-76`) includes **only active** `StoreModule` rows (`Include(s => s.StoreModules.Where(sm => sm.IsActive))`), each carrying `ModulePriceIncluded` — the paid/free snapshot taken at assignment (`StoreModule.cs:14`, set at `UpdateStoreCommand.cs:143-144,153`). Current active module ids and "on paid plan" are both computable with zero extra queries.
- **Spec intent**: `openspec/specs/billing/spec.md` Lock row — *"Once non-null, OwnerAdmin cannot change modules (plan is locked). SuperAdmin retains full edit"*. NOTE: the "once non-null" wording is stale vs. the implemented UI trigger (`isOnPaidPlan`); the H-15 delta spec must MODIFY that requirement or the paymentStartDate proxy regression returns.

## Findings (answers to the 8 questions)

1. **Where the guard goes + convention.** Handler-level, after store load (`UpdateStoreCommand.cs:74-76`), before `UpdateStoreModules` (`:104`). Handler-internal business-rule rejections in this same method use `ValidationException` → 400 with an error code (not-found `:76` → code "Id"; duplicate name `:79`); 403 `ApiException(Forbidden)` is reserved for the identity guard (`:72`). Filter-level `[HasPermission]` produces the other 403s (`StoresController.cs:117` on payment-date; `HasPermissionAttribute.cs:49-114`). `ErrorHandlerMiddleware.cs:73-97` maps `ValidationException` → 400 with `Errors[]`, `ApiException` → its own status. Existing tests assert error **codes**, not messages (`StoreUpdateTests.cs:197-214`).
2. **Existing backend E2E breakage under the lock.** None break under the recommended trigger (set-change + isOnPaidPlan + non-SuperAdmin). Full inventory in "Breakage inventory" below. The only test that exercises OwnerAdmin + activated store is `StoreCreationTrialTests.Update_by_non_superadmin_cannot_seed_paymentStartDate` (`Billing/StoreCreationTrialTests.cs:286-325`): OwnerAdmin PUTs an **unchanged** module set `[7,6]` on an API-created (activated) store, expects **200** — passes under set-change semantics, breaks under any-update semantics. This pins the design.
3. **S2-01 seeding breakage.** `degradeStoreToFreePlan` (`frontend-react/e2e/support/store-fixture.ts:127-183`) PUTs `moduleIds: freeIds` with the **owner-admin** bearer token on a store currently on the paid plan → under the lock this PUT changes the set on a paid store → rejected → S2-01's precondition becomes unreachable (exactly as README.md:308 predicted). Fix options in "Seeding risk".
4. **Frontend lock condition to mirror.** `!isSuperAdmin && isOnPaidPlan` where isOnPaidPlan = any ACTIVE store module with `!priceIncluded` (`store-form.tsx:83,252`). Server equivalent: `store.StoreModules.Any(sm => !sm.ModulePriceIncluded)`.
5. **Tests pinning "unchanged set allowed".** `StoreCreationTrialTests.cs:286-325` (above); also `StoreAuthorizationTests.OwnerAdmin_update_ignores_superadmin_only_fields` (`Stores/StoreAuthorizationTests.cs:55-75`) — OwnerAdmin PUT on a non-paid store (only module 7, PaymentStartDate null), unchanged set, expects 200 and asserts SuperAdmin-only fields ignored. Both must keep passing.
6. **Existing unit tests for the handler.** NONE. Grep of `Application.Tests` for `UpdateStore`/`UpdateStoreCommand` returns no files (only CreateStoreServiceTests, GetStoresQueryTests, SetMyStoreCommand*Tests under Stores). New unit tests would be strictly additive. Note: handler has 10 ctor dependencies (Moq surface) — E2E is the established coverage layer for this handler (StoreUpdateTests, StoreModuleLifecycleTests).
7. **Specs/docs documenting intent.** `openspec/specs/billing/spec.md:17` (Lock), `openspec/specs/store-module-lifecycle-e2e/spec.md` (R3/R4 — module add/remove behavior under SuperAdmin), `docs/testing/e2e-stage-1/S2-02.md` (DG-7 regression: lock must follow modules, not paymentStartDate), `README.md:302-308` (H-15), archived `2026-08-08-e2e-playwright-store-plan-activation-s2-01/design.md` D1 (`:26-35`, seeding relies on H-15 absence), archived `2026-08-11-store-creation-trial/proposal.md` (creation-unconditional + legacy update path preserved; test-5 rationale `:103-107`).
8. **Error message/status convention + i18n.** A new key is required: `Forbidden` is **absent** from the resx (grep of `backend/src/Resources/Localization` finds only NotAuthorized, StoreNotFound, StoreAlreadyExists, ModuleNotAvailableToStore) — `UpdateStoreCommand.cs:72`'s 403 currently falls back to the literal key name "Forbidden". `I18n.resx` is the Spanish base, `I18n.en.resx` the English override; handlers use the indexer (`_localizer["StoreNotFound"]`), so adding a key touches exactly those two files — no `I18n.Designer.cs` regeneration needed.

## Breakage inventory (existing tests vs the lock)

| Test | Identity | Store state | Module change? | Under lock |
|---|---|---|---|---|
| `StoreUpdateTests.*` (all 8) | SuperAdmin | mixed | varies | ✅ unaffected (SuperAdmin carve-out) |
| `StoreModuleLifecycleTests.*` (4) | SuperAdmin (`:102,:128,:149,:177`) | free/paid | add/remove | ✅ unaffected |
| `StoreActivationTests.*` (3, `Billing/`) | SuperAdmin | free+paid | add | ✅ unaffected |
| `StoreAuthorizationTests.cs:55-75` | OwnerAdmin | module 7 only, PaymentStartDate null | none (same set) | ✅ passes (not on paid plan) |
| `StoreCreationTrialTests.cs:286-325` | OwnerAdmin | API-created, paid, activated | **none** (same set `[7,6]`) | ✅ passes ONLY under set-change trigger |
| `store-plan-activation.spec.ts:77` (S2-01 seeding) | owner-admin persona | paid (H-1 registration) | **freeIds** (downgrade) | ❌ **BREAKS** — fix required (Seeding risk) |
| `store-plan-activation.spec.ts` save PUT (`:134-140`) | owner-admin | free (after seeding) | allIds (adds paid) | ✅ passes (store not on paid plan at that moment) |

## Seeding risk (S2-01) and options

The seeding PUT (`store-fixture.ts:127-183`) is a real API round-trip by design (archived design.md D1) — it degrades the store to the free plan so the UI half of DG-7 is reachable. Its step-4 precondition pinning asserts `paymentStartDate` stays **non-null** (`:167-174`; S2-02 depends on it) — the PUT sends `paymentStartDate: null` but that field is SuperAdmin-only and ignored (`UpdateStoreCommand.cs:100-101`).

- **A — SuperAdmin token for the seeding PUT.** Spec.md:17 carve-out keeps it working. **Infeasible on budget**: the Playwright suite documents exactly 4 logins + this file's 1 = **5/5 per minute** against `LoginPolicy` (`store-plan-activation.spec.ts:48-51`; `RateLimitPolicies.cs:15-24`; H-12 — rate limiting is active for the non-Testing Playwright backend). Minting a SuperAdmin = login #6 → 429 → breaks `login.spec.ts` REQ-9, the documented failure mode.
- **B — Direct DB seeding via `pg`** (precedent: `e2e/support/global-teardown.ts:1,27` — `Client` from `'pg'`, `DEFAULT_DB_URL = postgresql://postgres:postgres@localhost:5432/smca_test`, override `E2E_DB_URL`): DELETE the store's `StoreRoleFeature` + `StoreModule` rows, INSERT free-only `StoreModule` rows (ids from the catalog — the fixture already reads them, `store-fixture.ts:101`), leave the `Store` row untouched (PaymentStartDate stays non-null). No login, no rate-limit interaction, immune to the lock. Observable state is identical to today's API seeding: `GET /stores/{id}` returns exactly the free ids; the OwnerAdmin's featureIds derive from the `StoreRoleFeatures` enum + module set, NOT from SRF rows (`HasPermissionAttribute.cs:89-92`) — deleting module-6 SRF rows is invisible to the API. Deviates from D1's "API round-trip" choice; the 4-step precondition pinning (re-GET + assert) must be kept.
- **C — Seed in the .NET E2E fixture.** Separate suites, no shared mechanism. Rejected.

**Recommendation: B** (keeps the login budget intact, mirrors global-teardown precedent, preserves the precondition pinning).

## Approaches

1. **Handler-level set-change lock on paid stores (recommended)** — in `UpdateStoreCommandHandler`, after store load:
   `if (!IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded) && !request.ModuleIds.SetEquals(currentActiveIds)) → reject`
   - Pros: zero new queries (data already loaded `:74`); mirrors the UI trigger exactly (`store-form.tsx:83,252`); keeps `StoreCreationTrialTests.cs:286-325` green; SuperAdmin carve-out from spec.md:17; one code site.
   - Cons: none material. Set-comparison semantics (duplicates/order in `ModuleIds`) must be defined — the validator does not dedupe (`UpdateStoreCommandValidator.cs:30-33`); recommend distinct-sorted comparison.
   - Rejection shape: `ValidationException` with new Error code → 400 (consistent with `:76,:79` + code-based assertions `StoreUpdateTests.cs:197-214`). Alternative: `ApiException` → 403 (identity-guard convention `:72`); frontend renders generic `STORES.ERROR` either way (`es.ts:632`). **User decision.**
   - Effort: Low.

2. **Any-update rejection on activated stores** — reject every non-SuperAdmin update once `PaymentStartDate != null`.
   - Pros: simplest possible rule.
   - Cons: **breaks `StoreCreationTrialTests.cs:286-325`** (expected 200 on unchanged set); **breaks the activation flow** — every API-created store has PaymentStartDate non-null (`billing/spec.md:14`), so an OwnerAdmin could never add paid modules (the exact failure the UI comment `store-form.tsx:72-82` and S2-02.md exist to prevent). Uses the stale spec wording.
   - Effort: Low, but wrong.

3. **Filter/controller-level guard** — new `[HasPermission]`-style check or action-level logic in `StoresController.UpdatedStoreAsync` (`:97-107`).
   - Pros: centralizes authz in the filter layer.
   - Cons: the filter lacks the store's module state (would need billing/module round-trips per request, duplicating `BillingService` work `HasPermissionAttribute.cs:86-88`); cannot distinguish module-set change without the same handler data; splits the rule across layers.
   - Effort: Medium.

## Recommendation

**Approach 1** — handler-level, trigger = non-SuperAdmin AND store on paid plan (any active `StoreModule.ModulePriceIncluded == false`) AND requested `ModuleIds` differ from the current active set (distinct-sorted comparison). Rejection via `ValidationException` + new error code → 400, with the code added to `I18n.resx` + `I18n.en.resx` only. This is the ONLY trigger set that satisfies all of: spec.md:17, the UI implementation (`store-form.tsx:83`), S2-02's regression guard, and the existing test surface (`StoreCreationTrialTests.cs:286-325`).

Proposed test surface (all ADD-only, per the project rule):
- **Backend E2E (new tests in `SMCA.WebApi.E2ETests`)** — OwnerAdmin cannot change modules on a paid store (module change → 400 + new code); OwnerAdmin can still rename/address a paid store (same set → 200); OwnerAdmin on a FREE store can still add paid modules (activation flow → 200); SuperAdmin module change on a paid store → 200 (carve-out). SuperAdmin identity via `DbTestHelpers.SeedSuperAdminAsync` (existing pattern).
- **Application.Tests (optional, additive)** — no handler unit tests exist today; a handler unit test with the 10 Moq dependencies would pin the guard without a DB.
- **S2-01 seeding fix** — Option B (direct DB via `pg`), per Seeding risk. This touches `e2e/support/store-fixture.ts` — an existing E2E support file — which the project rule requires **explicit user authorization** for (behavior-affecting change, even though the seeding PUT itself would break otherwise).

## Risks

- **Angular legacy surface**: `frontend/src/app/presentation/stores/edit-store/edit-store.component.html:99-100` has NO DG-7 guard — paid-module checkboxes stay enabled for OwnerAdmin. H-15 will turn today's silent (server-ignored/UI-driven) plan edits on paid stores into 4xx responses in the legacy app. **User decision required**: companion UI guard (separate change) or accepted behavior.
- **Stale spec wording**: `billing/spec.md:17` ("Once non-null") contradicts the implemented trigger (isOnPaidPlan). The H-15 delta spec MUST include a MODIFIED Lock requirement, or S2-02's regression (the paymentStartDate proxy) resurfaces server-side.
- **Login budget**: any seeding fix that mints a new persona 429s `login.spec.ts` (documented: `store-plan-activation.spec.ts:48-51`). Option B avoids this entirely.
- **Existing E2E support files**: `store-fixture.ts` modification requires explicit user authorization per CLAUDE.md (existing support file, behavior-affecting). No existing E2E test file needs modification under Approach 1.
- **Set-comparison semantics**: `ModuleIds` may contain duplicates; define distinct-sorted set equality in the delta spec to avoid order/duplicate false-rejections.
- **New i18n key**: two-file edit (`I18n.resx` Spanish base + `I18n.en.resx`); do not regenerate `I18n.Designer.cs` (indexer access is the codebase pattern).
- **403-message quirk**: `Forbidden` key is absent from the resx — the existing 403 body says "Forbidden" literally. If Approach 1 uses 403, reuse the same indexer fallback behavior; if 400, the new key fixes the message.

## Ready for Proposal

**Yes.** Deliver to the user before proposal:
1. Lock rejection status: **400 + code** (recommended, matches handler convention) vs **403**.
2. S2-01 seeding fix: **Option B direct-DB** (recommended) vs Option A (budget-infeasible) — and explicit authorization to modify `e2e/support/store-fixture.ts`.
3. Angular legacy: accept 4xx behavior for unguarded OwnerAdmin plan edits (recommended, out of scope) or plan a companion change.